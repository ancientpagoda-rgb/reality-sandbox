import * as THREE from 'three';
import { biomeColor } from './planet.js';

const SEA_LEVEL = 0.53;
const Z_SCALE = 62;
const PATCH_SIZE = 420;
const PATCH_HALF = PATCH_SIZE / 2;
const CHUNK_STRIDE = 72;
const DESKTOP_SEGMENTS = 72;
const MOBILE_SEGMENTS = 52;
const SAMPLES_PER_SLICE = 220;
const FOV_DEGREES = 100;
const FLAT_WATER = Object.freeze({ rain: 0, cloud: 0, lake: 0, river: 0, snowpack: 0, groundwater: 0 });

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const wrap = (value, max) => ((value % max) + max) % max;

function shortestWrappedDelta(value, origin, size) {
  let delta = value - origin;
  if (delta > size * 0.5) delta -= size;
  else if (delta < -size * 0.5) delta += size;
  return delta;
}

function scheduleIdle(fn) {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 80 });
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
      planet?.world && planet?.living?.sampleDynamicPlanet && planet?.waterCycle?.sample &&
      modules?.step && mode?.getPlayer && mode?.isActive && layer && inputCanvas
    ) return { planet, modules, mode, layer, inputCanvas };
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  return null;
}

function install({ planet, modules, mode, layer, inputCanvas }) {
  if (window.realitySandboxSurfaceTerrainV31?.installed) return;

  const { world, living, waterCycle } = planet;
  const mobile = matchMedia('(max-width: 720px), (pointer: coarse)').matches;
  const segments = mobile ? MOBILE_SEGMENTS : DESKTOP_SEGMENTS;
  const side = segments + 1;
  const stats = {
    frames: 0,
    activeFrames: 0,
    worldStepsSuppressed: 0,
    moduleStepsSuppressed: 0,
    hudTerrainReads: 0,
    hudWaterReads: 0,
    terrainBuildRequests: 0,
    terrainBuildsCompleted: 0,
    terrainBuildsCancelled: 0,
    terrainSamples: 0,
    renderLoopTerrainSamples: 0,
    lastBuildMs: 0,
    lastBuildSamples: 0,
    contextLost: false,
  };

  const surfaceActive = () => Boolean(mode.isActive?.() && document.documentElement.dataset.surfaceMode === 'active');

  const previousBudget = world.getSphericalStepDt;
  world.getSphericalStepDt = function terrainOnlyWorldBudget(dt) {
    if (surfaceActive()) {
      stats.worldStepsSuppressed++;
      return false;
    }
    return typeof previousBudget === 'function' ? previousBudget.call(world, dt) : dt;
  };

  const nativeModuleStep = modules.step.bind(modules);
  modules.step = function terrainOnlyModuleStep(dt) {
    if (surfaceActive()) {
      stats.moduleStepsSuppressed++;
      return;
    }
    return nativeModuleStep(dt);
  };

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

  living.sampleDynamicPlanet = function cachedSurfaceTerrainRead(x, y, ...rest) {
    if (surfaceActive() && rest.length === 0) {
      stats.hudTerrainReads++;
      return cachedHudTerrain;
    }
    return nativeTerrainSample(x, y, ...rest);
  };

  waterCycle.sample = function terrainOnlyWaterRead(x, y, ...rest) {
    if (surfaceActive() && rest.length === 0) {
      stats.hudWaterReads++;
      return FLAT_WATER;
    }
    return nativeWaterSample(x, y, ...rest);
  };

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: false, antialias: false, powerPreference: 'high-performance', depth: true, stencil: false });
  } catch {
    document.documentElement.dataset.surfaceGpu = 'terrain-v31b-webgl-unavailable';
    return;
  }

  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x7798aa, 1);
  renderer.domElement.id = 'surfaceGpuCanvas';
  renderer.domElement.setAttribute('aria-label', 'Cached GPU terrain surface view of Nysa');
  Object.assign(renderer.domElement.style, {
    position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'none', zIndex: '0', pointerEvents: 'none',
  });
  layer.prepend(renderer.domElement);
  inputCanvas.style.zIndex = '1';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x7798aa);
  scene.fog = new THREE.Fog(0x7798aa, 150, 430);
  const camera = new THREE.PerspectiveCamera(FOV_DEGREES, 1, 0.1, 720);
  camera.rotation.order = 'YXZ';
  scene.add(new THREE.HemisphereLight(0xdceeff, 0x2d3a31, 1.8));
  const sun = new THREE.DirectionalLight(0xfff0d2, 2.35);
  sun.position.set(110, 180, 75);
  scene.add(sun);

  const terrainMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0 });
  const fallback = new THREE.Mesh(
    new THREE.PlaneGeometry(PATCH_SIZE, PATCH_SIZE, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x527a55, roughness: 1 }),
  );
  fallback.rotation.x = -Math.PI / 2;
  fallback.position.y = SEA_LEVEL * Z_SCALE;
  scene.add(fallback);

  let terrainMesh = null;
  let terrainData = null;
  let anchorX = NaN;
  let anchorY = NaN;
  let activeChunkKey = '';
  let requestedChunkKey = '';
  let buildGeneration = 0;
  let lastWidth = 0;
  let lastHeight = 0;

  function chunkForPlayer(player) {
    const chunkX = Math.floor(player.x / CHUNK_STRIDE);
    const chunkY = Math.floor(player.y / CHUNK_STRIDE);
    const x = wrap((chunkX + 0.5) * CHUNK_STRIDE, world.width);
    const rawY = (chunkY + 0.5) * CHUNK_STRIDE;
    const minY = Math.min(PATCH_HALF, world.height * 0.5);
    const maxY = Math.max(minY, world.height - minY);
    const y = clamp(rawY, minY, maxY);
    return { key: `${chunkX}:${chunkY}`, x, y };
  }

  function terrainColor(sample) {
    if (!sample?.land) return [0.055, 0.30, 0.46];
    const color = biomeColor(sample);
    return [color[0] / 255, color[1] / 255, color[2] / 255];
  }

  function requestTerrainBuild(player) {
    const chunk = chunkForPlayer(player);
    if (chunk.key === activeChunkKey || chunk.key === requestedChunkKey) return;

    requestedChunkKey = chunk.key;
    const generation = ++buildGeneration;
    stats.terrainBuildRequests++;
    const startedAt = performance.now();
    const samplesAtStart = stats.terrainSamples;

    const geometry = new THREE.PlaneGeometry(PATCH_SIZE, PATCH_SIZE, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    const colors = new Float32Array(positions.count * 3);
    const heights = new Float32Array(positions.count);
    let index = 0;
    let centerSample = null;

    function cancel() {
      geometry.dispose();
      stats.terrainBuildsCancelled++;
      if (generation === buildGeneration) requestedChunkKey = '';
    }

    function slice(deadline) {
      if (generation !== buildGeneration || !surfaceActive()) {
        cancel();
        return;
      }

      let count = 0;
      while (index < positions.count) {
        const localX = positions.getX(index);
        const localZ = positions.getZ(index);
        const wx = wrap(chunk.x + localX, world.width);
        const wy = clamp(chunk.y + localZ, 0, world.height);
        const sample = nativeTerrainSample(wx, wy);
        stats.terrainSamples++;
        count++;

        const elevation = sample?.land ? clamp(sample.elevation ?? SEA_LEVEL, 0, 1) : SEA_LEVEL - 0.005;
        const height = elevation * Z_SCALE;
        heights[index] = height;
        positions.setY(index, height);
        const color = terrainColor(sample);
        colors[index * 3] = color[0];
        colors[index * 3 + 1] = color[1];
        colors[index * 3 + 2] = color[2];
        if (index === Math.floor(positions.count / 2)) centerSample = sample;
        index++;

        if (count >= SAMPLES_PER_SLICE) break;
        if (deadline?.timeRemaining && deadline.timeRemaining() < 1.2) break;
      }

      if (index < positions.count) {
        scheduleIdle(slice);
        return;
      }
      if (generation !== buildGeneration || !surfaceActive()) {
        cancel();
        return;
      }

      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geometry.computeVertexNormals();
      const nextMesh = new THREE.Mesh(geometry, terrainMaterial);
      nextMesh.frustumCulled = true;
      scene.add(nextMesh);
      if (terrainMesh) {
        scene.remove(terrainMesh);
        terrainMesh.geometry.dispose();
      }

      terrainMesh = nextMesh;
      fallback.visible = false;
      anchorX = chunk.x;
      anchorY = chunk.y;
      activeChunkKey = chunk.key;
      requestedChunkKey = '';
      terrainData = { heights, anchorX, anchorY };
      if (centerSample) cachedHudTerrain = centerSample;
      stats.terrainBuildsCompleted++;
      stats.lastBuildMs = performance.now() - startedAt;
      stats.lastBuildSamples = stats.terrainSamples - samplesAtStart;
      document.documentElement.dataset.surfaceTerrainChunk = activeChunkKey;
      document.documentElement.dataset.surfaceTerrainBuildMs = stats.lastBuildMs.toFixed(1);
    }

    scheduleIdle(slice);
  }

  function cachedGroundHeight(player) {
    if (!terrainData) return SEA_LEVEL * Z_SCALE;
    const localX = shortestWrappedDelta(player.x, terrainData.anchorX, world.width);
    const localZ = player.y - terrainData.anchorY;
    const u = clamp((localX + PATCH_HALF) / PATCH_SIZE, 0, 1) * segments;
    // PlaneGeometry row zero becomes localZ=-PATCH_HALF after rotateX(-PI/2).
    const v = clamp((localZ + PATCH_HALF) / PATCH_SIZE, 0, 1) * segments;
    const x0 = Math.floor(u);
    const z0 = Math.floor(v);
    const x1 = Math.min(segments, x0 + 1);
    const z1 = Math.min(segments, z0 + 1);
    const tx = u - x0;
    const tz = v - z0;
    const at = (x, z) => terrainData.heights[z * side + x] ?? SEA_LEVEL * Z_SCALE;
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
    document.documentElement.dataset.surfaceGpu = 'terrain-v31b-context-lost';
  }, false);
  renderer.domElement.addEventListener('webglcontextrestored', () => { stats.contextLost = false; }, false);

  function loop() {
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
    requestTerrainBuild(player);
    const localX = Number.isFinite(anchorX) ? shortestWrappedDelta(player.x, anchorX, world.width) : 0;
    const localZ = Number.isFinite(anchorY) ? player.y - anchorY : 0;
    const groundY = cachedGroundHeight(player);
    camera.position.set(localX, groundY + Math.max(3.6, player.altitude || 3.6), localZ);
    camera.rotation.y = -(player.yaw || 0) - Math.PI * 0.5;
    camera.rotation.x = player.pitch || 0;
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
      diagnosticScene: 'cached-terrain-only',
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
      scene: 'cached-terrain-only',
      simulationRunning: !surfaceActive(),
      waterEnabled: false,
      vegetationEnabled: false,
      weatherEnabled: false,
      creaturesEnabled: false,
      proceduralTerrainInRenderLoop: false,
      activeChunkKey,
      requestedChunkKey,
      segments,
      patchSize: PATCH_SIZE,
      chunkStride: CHUNK_STRIDE,
    }),
  };
  window.realitySandboxSurfaceTerrainV31 = api;
  document.documentElement.dataset.surfaceTerrainV31 = 'cached-terrain-only-v31b';

  const previousDiagnostics = window.realitySandboxPresentationDiagnostics;
  window.realitySandboxPresentationDiagnostics = () => ({
    ...(typeof previousDiagnostics === 'function' ? previousDiagnostics() : {}),
    surfaceGpu: gpuApi.getStats(),
    surfaceTerrainV31: api.getStats(),
  });
}

async function boot() {
  const state = await waitForRuntime();
  if (!state) {
    document.documentElement.dataset.surfaceTerrainV31 = 'unavailable';
    return;
  }
  install(state);
}

boot();
