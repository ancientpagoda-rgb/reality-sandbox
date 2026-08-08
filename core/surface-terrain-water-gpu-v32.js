import * as THREE from 'three';
import { biomeColor } from './planet.js';

// v32 builds directly on the known-smooth v31b terrain path.
// Surface Mode keeps the authoritative simulation paused. The near terrain +
// water tile is prepared first in idle slices; only after it is ready do two
// progressively coarser rings stream in around it. Camera/render frames never
// call procedural terrain, hydrology, ecology, weather, or creature samplers.

const SEA_LEVEL = 0.53;
const Z_SCALE = 62;
const TILE_SIZE = 420;
const TILE_HALF = TILE_SIZE / 2;
const CHUNK_STRIDE = 72;
const NEAR_SEGMENTS_DESKTOP = 72;
const NEAR_SEGMENTS_MOBILE = 52;
const MID_SEGMENTS_DESKTOP = 18;
const MID_SEGMENTS_MOBILE = 14;
const FAR_SEGMENTS_DESKTOP = 10;
const FAR_SEGMENTS_MOBILE = 8;
const NEAR_SAMPLES_PER_SLICE = 150;
const DISTANT_SAMPLES_PER_SLICE = 80;
const DISTANT_START_DELAY_MS = 450;
const FOV_DEGREES = 100;
const TILE_OVERLAP = 1.003;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const wrap = (value, max) => ((value % max) + max) % max;

function shortestWrappedDelta(value, origin, size) {
  let delta = value - origin;
  if (delta > size * 0.5) delta -= size;
  else if (delta < -size * 0.5) delta += size;
  return delta;
}

function scheduleIdle(fn, timeout = 100) {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout });
  else setTimeout(() => fn({ timeRemaining: () => 4, didTimeout: true }), 0);
}

async function waitForRuntime() {
  for (let attempt = 0; attempt < 300; attempt++) {
    const planet = window.realitySandboxPlanet;
    const modules = window.realitySandboxModules;
    const mode = window.realitySandboxSurfaceMode;
    const layer = document.getElementById('surfaceModeLayer');
    const inputCanvas = document.getElementById('surfaceModeCanvas');
    if (
      planet?.world &&
      planet?.living?.sampleDynamicPlanet &&
      planet?.waterCycle?.sample &&
      modules?.step &&
      mode?.getPlayer &&
      mode?.isActive &&
      layer &&
      inputCanvas
    ) return { planet, modules, mode, layer, inputCanvas };
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  return null;
}

function install({ planet, modules, mode, layer, inputCanvas }) {
  if (window.realitySandboxSurfaceTerrainWaterV32?.installed) return;

  const { world, living, waterCycle } = planet;
  const mobile = matchMedia('(max-width: 720px), (pointer: coarse)').matches;
  const nearSegments = mobile ? NEAR_SEGMENTS_MOBILE : NEAR_SEGMENTS_DESKTOP;
  const midSegments = mobile ? MID_SEGMENTS_MOBILE : MID_SEGMENTS_DESKTOP;
  const farSegments = mobile ? FAR_SEGMENTS_MOBILE : FAR_SEGMENTS_DESKTOP;
  const nearSide = nearSegments + 1;

  const stats = {
    frames: 0,
    activeFrames: 0,
    worldStepsSuppressed: 0,
    moduleStepsSuppressed: 0,
    hudTerrainReads: 0,
    hudWaterReads: 0,
    nearBuildRequests: 0,
    nearBuildsCompleted: 0,
    distantBuildsCompleted: 0,
    buildCancels: 0,
    terrainSamples: 0,
    waterSamples: 0,
    renderLoopProceduralSamples: 0,
    lastNearBuildMs: 0,
    lastNearBuildSamples: 0,
    distantTilesVisible: 0,
    midRingComplete: false,
    farRingComplete: false,
    contextLost: false,
  };

  const surfaceActive = () => Boolean(mode.isActive?.() && document.documentElement.dataset.surfaceMode === 'active');

  // Preserve the smooth checkpoint: the full simulation remains paused while
  // Surface Mode is active. This phase measures terrain + water presentation only.
  const previousBudget = world.getSphericalStepDt;
  world.getSphericalStepDt = function terrainWaterWorldBudget(dt) {
    if (surfaceActive()) {
      stats.worldStepsSuppressed++;
      return false;
    }
    return typeof previousBudget === 'function' ? previousBudget.call(world, dt) : dt;
  };

  const nativeModuleStep = modules.step.bind(modules);
  modules.step = function terrainWaterModuleStep(dt) {
    if (surfaceActive()) {
      stats.moduleStepsSuppressed++;
      return;
    }
    return nativeModuleStep(dt);
  };

  // Capture the native-ish samplers once for background tile construction.
  // HUD reads are intercepted and served from cached center values instead.
  const nativeTerrainSample = living.sampleDynamicPlanet.bind(living);
  const nativeWaterSample = waterCycle.sample.bind(waterCycle);
  let cachedHudTerrain = Object.freeze({
    land: true,
    elevation: SEA_LEVEL,
    biome: 'terrain-loading',
    temperature: 18,
    moisture: 0.5,
    fertility: 0.5,
  });
  let cachedHudWater = Object.freeze({ rain: 0, cloud: 0, lake: 0, river: 0, snowpack: 0, groundwater: 0 });

  living.sampleDynamicPlanet = function cachedSurfaceTerrainRead(x, y, ...rest) {
    if (surfaceActive() && rest.length === 0) {
      stats.hudTerrainReads++;
      return cachedHudTerrain;
    }
    return nativeTerrainSample(x, y, ...rest);
  };

  waterCycle.sample = function cachedSurfaceWaterRead(x, y, ...rest) {
    if (surfaceActive() && rest.length === 0) {
      stats.hudWaterReads++;
      return cachedHudWater;
    }
    return nativeWaterSample(x, y, ...rest);
  };

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      alpha: false,
      antialias: false,
      powerPreference: 'high-performance',
      depth: true,
      stencil: false,
    });
  } catch {
    document.documentElement.dataset.surfaceGpu = 'terrain-water-v32-webgl-unavailable';
    return;
  }

  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.03;
  renderer.setClearColor(0x7798aa, 1);
  renderer.domElement.id = 'surfaceGpuCanvas';
  renderer.domElement.setAttribute('aria-label', 'Cached GPU terrain and water surface view of Nysa');
  Object.assign(renderer.domElement.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    display: 'none',
    zIndex: '0',
    pointerEvents: 'none',
  });
  layer.prepend(renderer.domElement);
  inputCanvas.style.zIndex = '1';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x7798aa);
  scene.fog = new THREE.Fog(0x7798aa, 180, 1180);
  const camera = new THREE.PerspectiveCamera(FOV_DEGREES, 1, 0.1, 1500);
  camera.rotation.order = 'YXZ';

  scene.add(new THREE.HemisphereLight(0xdceeff, 0x2d3a31, 1.8));
  const sun = new THREE.DirectionalLight(0xfff0d2, 2.35);
  sun.position.set(110, 180, 75);
  scene.add(sun);

  const terrainMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.94,
    metalness: 0,
  });

  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      deepColor: { value: new THREE.Color(0x0b466e) },
      shallowColor: { value: new THREE.Color(0x2f91aa) },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `
      uniform float time;
      attribute float waterStrength;
      varying float vWater;
      varying float vWave;
      void main() {
        vec3 p = position;
        float wave = (sin((p.x + time * 4.6) * 0.15) + cos((p.z - time * 3.9) * 0.13)) * 0.075 * waterStrength;
        p.y += wave;
        vWater = waterStrength;
        vWave = wave;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 deepColor;
      uniform vec3 shallowColor;
      varying float vWater;
      varying float vWave;
      void main() {
        if (vWater < 0.14) discard;
        float strength = smoothstep(0.14, 0.9, vWater);
        vec3 color = mix(shallowColor, deepColor, clamp(0.25 + strength * 0.60 - vWave * 1.5, 0.0, 1.0));
        gl_FragColor = vec4(color, 0.50 + strength * 0.32);
      }
    `,
  });

  // Smooth fallback appears immediately while the first real near tile streams.
  const fallback = new THREE.Mesh(
    new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x527a55, roughness: 1 }),
  );
  fallback.rotation.x = -Math.PI / 2;
  fallback.position.y = SEA_LEVEL * Z_SCALE;
  scene.add(fallback);

  let nearTerrainMesh = null;
  let nearWaterMesh = null;
  let nearTerrainData = null;
  const distantTiles = new Map();
  let anchorX = NaN;
  let anchorY = NaN;
  let activeChunkKey = '';
  let requestedChunkKey = '';
  let generation = 0;
  let lastWidth = 0;
  let lastHeight = 0;
  let distantQueueTimer = 0;

  function chunkForPlayer(player) {
    const chunkX = Math.floor(player.x / CHUNK_STRIDE);
    const chunkY = Math.floor(player.y / CHUNK_STRIDE);
    const x = wrap((chunkX + 0.5) * CHUNK_STRIDE, world.width);
    const rawY = (chunkY + 0.5) * CHUNK_STRIDE;
    const minY = Math.min(TILE_HALF, world.height * 0.5);
    const maxY = Math.max(minY, world.height - minY);
    const y = clamp(rawY, minY, maxY);
    return { key: `${chunkX}:${chunkY}`, x, y };
  }

  function terrainColor(sample) {
    if (!sample?.land) return [0.055, 0.30, 0.46];
    const color = biomeColor(sample);
    return [color[0] / 255, color[1] / 255, color[2] / 255];
  }

  function waterStrengthFor(terrain, water) {
    if (!terrain?.land) return 1;
    return clamp(Math.max(water?.lake || 0, (water?.river || 0) * 0.92), 0, 1);
  }

  function disposePair(pair) {
    if (!pair) return;
    if (pair.terrain) {
      scene.remove(pair.terrain);
      pair.terrain.geometry.dispose();
    }
    if (pair.water) {
      scene.remove(pair.water);
      pair.water.geometry.dispose();
    }
  }

  function clearDistantTiles() {
    for (const pair of distantTiles.values()) disposePair(pair);
    distantTiles.clear();
    stats.distantTilesVisible = 0;
    stats.midRingComplete = false;
    stats.farRingComplete = false;
  }

  function buildTile({
    tileX,
    tileY,
    offsetX,
    offsetZ,
    segments,
    samplesPerSlice,
    buildGeneration,
    kind,
    onComplete,
  }) {
    const terrainGeometry = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE, segments, segments);
    terrainGeometry.rotateX(-Math.PI / 2);
    const positions = terrainGeometry.attributes.position;
    const colors = new Float32Array(positions.count * 3);
    const heights = new Float32Array(positions.count);
    const waterHeights = new Float32Array(positions.count);
    const waterStrengths = new Float32Array(positions.count);
    let index = 0;
    let centerTerrain = null;
    let centerWater = null;
    let cancelled = false;

    function cancel() {
      if (cancelled) return;
      cancelled = true;
      terrainGeometry.dispose();
      stats.buildCancels++;
    }

    function slice(deadline) {
      if (buildGeneration !== generation || !surfaceActive()) {
        cancel();
        return;
      }

      let count = 0;
      while (index < positions.count) {
        const localX = positions.getX(index);
        const localZ = positions.getZ(index);
        const wx = wrap(tileX + localX, world.width);
        const wy = clamp(tileY + localZ, 0, world.height);
        const terrain = nativeTerrainSample(wx, wy);
        const water = nativeWaterSample(wx, wy);
        stats.terrainSamples++;
        stats.waterSamples++;
        count++;

        const elevation = terrain?.land
          ? clamp(terrain.elevation ?? SEA_LEVEL, 0, 1)
          : SEA_LEVEL - 0.005;
        const height = elevation * Z_SCALE;
        heights[index] = height;
        positions.setY(index, height);

        const color = terrainColor(terrain);
        colors[index * 3] = color[0];
        colors[index * 3 + 1] = color[1];
        colors[index * 3 + 2] = color[2];

        const waterStrength = waterStrengthFor(terrain, water);
        waterStrengths[index] = waterStrength;
        waterHeights[index] = terrain?.land
          ? height + 0.10
          : SEA_LEVEL * Z_SCALE + 0.14;

        if (index === Math.floor(positions.count / 2)) {
          centerTerrain = terrain;
          centerWater = water;
        }
        index++;

        if (count >= samplesPerSlice) break;
        if (deadline?.timeRemaining && deadline.timeRemaining() < 1.2) break;
      }

      if (index < positions.count) {
        scheduleIdle(slice, kind === 'near' ? 80 : 180);
        return;
      }
      if (buildGeneration !== generation || !surfaceActive()) {
        cancel();
        return;
      }

      terrainGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      terrainGeometry.computeVertexNormals();
      const terrainMesh = new THREE.Mesh(terrainGeometry, terrainMaterial);
      terrainMesh.frustumCulled = true;
      terrainMesh.position.set(offsetX, 0, offsetZ);
      if (kind !== 'near') terrainMesh.scale.set(TILE_OVERLAP, 1, TILE_OVERLAP);

      const waterGeometry = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE, segments, segments);
      waterGeometry.rotateX(-Math.PI / 2);
      const waterPositions = waterGeometry.attributes.position;
      for (let i = 0; i < waterPositions.count; i++) waterPositions.setY(i, waterHeights[i]);
      waterGeometry.setAttribute('waterStrength', new THREE.BufferAttribute(waterStrengths, 1));
      const waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
      waterMesh.position.set(offsetX, 0, offsetZ);
      if (kind !== 'near') waterMesh.scale.set(TILE_OVERLAP, 1, TILE_OVERLAP);
      waterMesh.renderOrder = 3;

      scene.add(terrainMesh, waterMesh);
      onComplete({
        terrain: terrainMesh,
        water: waterMesh,
        heights,
        centerTerrain,
        centerWater,
        side: segments + 1,
        segments,
      });
    }

    scheduleIdle(slice, kind === 'near' ? 80 : 180);
  }

  function ringOffsets(radius) {
    const result = [];
    for (let z = -radius; z <= radius; z++) {
      for (let x = -radius; x <= radius; x++) {
        if (Math.max(Math.abs(x), Math.abs(z)) !== radius) continue;
        result.push({ x, z });
      }
    }
    // Cardinal directions first, then diagonals/corners. This fills the most
    // noticeable horizon gaps before less visible corner squares.
    result.sort((a, b) => (Math.abs(a.x) + Math.abs(a.z)) - (Math.abs(b.x) + Math.abs(b.z)));
    return result;
  }

  function queueDistantRings(buildGeneration) {
    clearTimeout(distantQueueTimer);
    distantQueueTimer = setTimeout(() => {
      if (buildGeneration !== generation || !surfaceActive() || !Number.isFinite(anchorX)) return;
      const queue = [
        ...ringOffsets(1).map(offset => ({ ...offset, ring: 1, segments: midSegments })),
        ...ringOffsets(2).map(offset => ({ ...offset, ring: 2, segments: farSegments })),
      ];
      let queueIndex = 0;

      function buildNext() {
        if (buildGeneration !== generation || !surfaceActive()) return;
        if (queueIndex >= queue.length) {
          stats.midRingComplete = true;
          stats.farRingComplete = true;
          document.documentElement.dataset.surfaceDistantRings = 'complete';
          return;
        }

        const item = queue[queueIndex++];
        const key = `${item.x}:${item.z}`;
        const offsetX = item.x * TILE_SIZE;
        const offsetZ = item.z * TILE_SIZE;
        const tileX = wrap(anchorX + offsetX, world.width);
        const tileY = anchorY + offsetZ;

        buildTile({
          tileX,
          tileY,
          offsetX,
          offsetZ,
          segments: item.segments,
          samplesPerSlice: DISTANT_SAMPLES_PER_SLICE,
          buildGeneration,
          kind: item.ring === 1 ? 'mid' : 'far',
          onComplete: pair => {
            if (buildGeneration !== generation || !surfaceActive()) {
              disposePair(pair);
              return;
            }
            distantTiles.set(key, pair);
            stats.distantBuildsCompleted++;
            stats.distantTilesVisible = distantTiles.size;
            if (item.ring === 1 && queueIndex >= 8) stats.midRingComplete = true;
            document.documentElement.dataset.surfaceDistantTiles = String(distantTiles.size);
            scheduleIdle(buildNext, 220);
          },
        });
      }

      scheduleIdle(buildNext, 220);
    }, DISTANT_START_DELAY_MS);
  }

  function requestNearBuild(player) {
    const chunk = chunkForPlayer(player);
    if (chunk.key === activeChunkKey || chunk.key === requestedChunkKey) return;

    requestedChunkKey = chunk.key;
    const buildGeneration = ++generation;
    stats.nearBuildRequests++;
    clearTimeout(distantQueueTimer);
    clearDistantTiles();
    const startedAt = performance.now();
    const terrainAtStart = stats.terrainSamples;
    const waterAtStart = stats.waterSamples;

    buildTile({
      tileX: chunk.x,
      tileY: chunk.y,
      offsetX: 0,
      offsetZ: 0,
      segments: nearSegments,
      samplesPerSlice: NEAR_SAMPLES_PER_SLICE,
      buildGeneration,
      kind: 'near',
      onComplete: pair => {
        if (buildGeneration !== generation || !surfaceActive()) {
          disposePair(pair);
          return;
        }

        if (nearTerrainMesh) {
          scene.remove(nearTerrainMesh);
          nearTerrainMesh.geometry.dispose();
        }
        if (nearWaterMesh) {
          scene.remove(nearWaterMesh);
          nearWaterMesh.geometry.dispose();
        }

        nearTerrainMesh = pair.terrain;
        nearWaterMesh = pair.water;
        nearTerrainData = {
          heights: pair.heights,
          side: pair.side,
          segments: pair.segments,
          anchorX: chunk.x,
          anchorY: chunk.y,
        };
        anchorX = chunk.x;
        anchorY = chunk.y;
        activeChunkKey = chunk.key;
        requestedChunkKey = '';
        fallback.visible = false;
        if (pair.centerTerrain) cachedHudTerrain = pair.centerTerrain;
        if (pair.centerWater) cachedHudWater = pair.centerWater;

        stats.nearBuildsCompleted++;
        stats.lastNearBuildMs = performance.now() - startedAt;
        stats.lastNearBuildSamples =
          (stats.terrainSamples - terrainAtStart) + (stats.waterSamples - waterAtStart);
        document.documentElement.dataset.surfaceTerrainChunk = activeChunkKey;
        document.documentElement.dataset.surfaceTerrainBuildMs = stats.lastNearBuildMs.toFixed(1);
        document.documentElement.dataset.surfaceDistantRings = 'loading';
        queueDistantRings(buildGeneration);
      },
    });
  }

  function cachedGroundHeight(player) {
    if (!nearTerrainData) return SEA_LEVEL * Z_SCALE;
    const localX = shortestWrappedDelta(player.x, nearTerrainData.anchorX, world.width);
    const localZ = player.y - nearTerrainData.anchorY;
    const segments = nearTerrainData.segments;
    const u = clamp((localX + TILE_HALF) / TILE_SIZE, 0, 1) * segments;
    const v = clamp((localZ + TILE_HALF) / TILE_SIZE, 0, 1) * segments;
    const x0 = Math.floor(u);
    const z0 = Math.floor(v);
    const x1 = Math.min(segments, x0 + 1);
    const z1 = Math.min(segments, z0 + 1);
    const tx = u - x0;
    const tz = v - z0;
    const at = (x, z) => nearTerrainData.heights[z * nearTerrainData.side + x] ?? SEA_LEVEL * Z_SCALE;
    const a = at(x0, z0) * (1 - tx) + at(x1, z0) * tx;
    const b = at(x0, z1) * (1 - tx) + at(x1, z1) * tx;
    return a * (1 - tz) + b * tz;
  }

  function resize() {
    const rect = layer.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (width === lastWidth && height === lastHeight) return;
    lastWidth = width;
    lastHeight = height;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function isPresenting() {
    return surfaceActive() && !stats.contextLost;
  }

  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    stats.contextLost = true;
    document.documentElement.dataset.surfaceGpu = 'terrain-water-v32-context-lost';
  }, false);
  renderer.domElement.addEventListener('webglcontextrestored', () => { stats.contextLost = false; }, false);

  function loop(now) {
    requestAnimationFrame(loop);
    stats.frames++;
    if (!surfaceActive()) {
      renderer.domElement.style.display = 'none';
      return;
    }

    stats.activeFrames++;
    renderer.domElement.style.display = 'block';
    inputCanvas.style.opacity = '0';
    resize();

    const player = mode.getPlayer();
    requestNearBuild(player);
    const localX = Number.isFinite(anchorX) ? shortestWrappedDelta(player.x, anchorX, world.width) : 0;
    const localZ = Number.isFinite(anchorY) ? player.y - anchorY : 0;
    const groundY = cachedGroundHeight(player);
    camera.position.set(localX, groundY + Math.max(3.6, player.altitude || 3.6), localZ);
    camera.rotation.y = -(player.yaw || 0) - Math.PI * 0.5;
    camera.rotation.x = player.pitch || 0;

    waterMaterial.uniforms.time.value = now * 0.001;
    renderer.render(scene, camera);
    document.documentElement.dataset.surfaceGpu = 'active';
    document.documentElement.dataset.surfaceModeVisibleCreatures = '0';
  }
  requestAnimationFrame(loop);

  const gpuApi = {
    installed: true,
    isPresenting,
    getStats: () => ({
      renderer: 'WebGLRenderer',
      gpuPrimary: true,
      active: isPresenting(),
      diagnosticScene: 'cached-terrain-water-lod-rings',
      frames: stats.frames,
      activeFrames: stats.activeFrames,
      rendererInfo: {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        points: renderer.info.render.points,
        lines: renderer.info.render.lines,
      },
    }),
  };
  window.realitySandboxSurfaceGpu = gpuApi;

  const api = {
    installed: true,
    getStats: () => ({
      ...stats,
      surfaceActive: surfaceActive(),
      scene: 'cached-terrain-water-lod-rings',
      simulationRunning: !surfaceActive(),
      waterEnabled: true,
      vegetationEnabled: false,
      weatherEnabled: false,
      creaturesEnabled: false,
      proceduralSamplingInRenderLoop: false,
      activeChunkKey,
      requestedChunkKey,
      nearSegments,
      midSegments,
      farSegments,
      tileSize: TILE_SIZE,
      chunkStride: CHUNK_STRIDE,
      plannedDistantTiles: 24,
    }),
  };

  window.realitySandboxSurfaceTerrainWaterV32 = api;
  document.documentElement.dataset.surfaceTerrainWaterV32 = 'cached-water-two-lod-rings';

  const previousDiagnostics = window.realitySandboxPresentationDiagnostics;
  window.realitySandboxPresentationDiagnostics = () => ({
    ...(typeof previousDiagnostics === 'function' ? previousDiagnostics() : {}),
    surfaceGpu: gpuApi.getStats(),
    surfaceTerrainWaterV32: api.getStats(),
  });
}

async function boot() {
  const state = await waitForRuntime();
  if (!state) {
    document.documentElement.dataset.surfaceTerrainWaterV32 = 'unavailable';
    return;
  }
  install(state);
}

boot();
