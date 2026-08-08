import * as THREE from 'three';
import { biomeColor } from './planet.js';

const SEA_LEVEL = 0.53;
const Z_SCALE = 62;
const FOV_DEGREES = 129.6;
const PATCH_RADIUS = 190;
const PATCH_DIAMETER = PATCH_RADIUS * 2;
const TERRAIN_SEGMENTS_DESKTOP = 72;
const TERRAIN_SEGMENTS_MOBILE = 48;
const TERRAIN_REBUILD_DISTANCE = 22;
const TERRAIN_REFRESH_MS = 9000;
const CREATURE_RADIUS = 155;
const CREATURE_UPDATE_MS = 120;
const SKY_UPDATE_MS = 240;
const CANVAS_FALLBACK_SIZE = 2;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const wrap = (value, max) => ((value % max) + max) % max;
const lerp = (a, b, t) => a + (b - a) * t;

function shortestWrappedDelta(value, origin, size) {
  let delta = value - origin;
  if (delta > size * 0.5) delta -= size;
  else if (delta < -size * 0.5) delta += size;
  return delta;
}

function mixColor(a, b, t) {
  return a.map((value, index) => lerp(value, b[index], t));
}

function hash2(x, y, seed = 0) {
  let h = (Math.imul(Math.floor(x), 374761393) ^ Math.imul(Math.floor(y), 668265263) ^ seed) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function makeRectLike(rect, width, height) {
  if (typeof DOMRect === 'function') return new DOMRect(rect.x, rect.y, width, height);
  return {
    x: rect.x,
    y: rect.y,
    top: rect.top,
    left: rect.left,
    right: rect.left + width,
    bottom: rect.top + height,
    width,
    height,
    toJSON: () => ({ x: rect.x, y: rect.y, width, height }),
  };
}

async function waitForSurfaceRuntime() {
  for (let attempt = 0; attempt < 300; attempt++) {
    const planet = window.realitySandboxPlanet;
    const mode = window.realitySandboxSurfaceMode;
    const layer = document.getElementById('surfaceModeLayer');
    const canvas = document.getElementById('surfaceModeCanvas');
    const perf = window.realitySandboxSurfacePerformance;
    if (
      planet?.world &&
      planet?.living?.sampleDynamicPlanet &&
      planet?.waterCycle?.sample &&
      mode?.getPlayer &&
      layer &&
      canvas &&
      perf?.installed
    ) {
      return { planet, mode, layer, canvas };
    }
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  return null;
}

function installSurfaceGpu({ planet, mode, layer, canvas }) {
  if (window.realitySandboxSurfaceGpu?.installed) return;

  const { world, living, waterCycle } = planet;
  const seed = window.realitySandboxSeed?.numericSeed || 734221;
  const mobile = matchMedia('(max-width: 720px), (pointer: coarse)').matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      alpha: false,
      antialias: !mobile,
      powerPreference: 'high-performance',
      depth: true,
      stencil: false,
    });
  } catch (error) {
    document.documentElement.dataset.surfaceGpu = 'fallback-webgl-unavailable';
    return;
  }

  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.1 : 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.setClearColor(0x6f8f98, 1);
  renderer.domElement.id = 'surfaceGpuCanvas';
  renderer.domElement.setAttribute('aria-label', 'GPU-rendered first-person surface view of Nysa');
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

  canvas.style.zIndex = '1';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x6f8f98);
  scene.fog = new THREE.Fog(0x8aa19f, 78, 235);

  const camera = new THREE.PerspectiveCamera(FOV_DEGREES, 1, 0.15, 270);
  camera.rotation.order = 'YXZ';

  const hemi = new THREE.HemisphereLight(0xcfe5ff, 0x26352d, 1.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffefd0, 2.45);
  sun.position.set(90, 135, 65);
  scene.add(sun);

  const terrainRoot = new THREE.Group();
  scene.add(terrainRoot);

  const terrainMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.93,
    metalness: 0,
  });

  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      deepColor: { value: new THREE.Color(0x0c4770) },
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
        float wave = (sin((p.x + time * 5.0) * 0.18) + cos((p.z - time * 4.0) * 0.15)) * 0.085 * waterStrength;
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
        if (vWater < 0.16) discard;
        float strength = smoothstep(0.16, 0.88, vWater);
        vec3 color = mix(shallowColor, deepColor, clamp(0.28 + strength * 0.56 - vWave * 1.8, 0.0, 1.0));
        gl_FragColor = vec4(color, 0.52 + strength * 0.30);
      }
    `,
  });

  const vegetationGeometry = new THREE.ConeGeometry(1.05, 4.5, 6);
  vegetationGeometry.translate(0, 2.25, 0);
  const vegetationMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    vertexColors: false,
  });

  const rockGeometry = new THREE.DodecahedronGeometry(1.1, 0);
  const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x77746b, roughness: 1 });

  const creatureGeometry = new THREE.IcosahedronGeometry(0.75, 1);
  const creatureMaterials = {
    agent: new THREE.MeshStandardMaterial({ color: 0xd8c890, roughness: 0.9 }),
    predator: new THREE.MeshStandardMaterial({ color: 0xd29173, roughness: 0.9 }),
    apex: new THREE.MeshStandardMaterial({ color: 0xc06960, roughness: 0.9 }),
  };

  let terrainMesh = null;
  let waterMesh = null;
  let vegetationMesh = null;
  let rockMesh = null;
  const creatureMeshes = new Map();
  let anchorX = NaN;
  let anchorY = NaN;
  let terrainBuiltAt = -Infinity;
  let terrainBuilds = 0;
  let terrainSamples = 0;
  let waterSamples = 0;
  let vegetationInstances = 0;
  let rockInstances = 0;
  let visibleCreatures = 0;
  let creatureUpdates = 0;
  let lastCreatureUpdate = -Infinity;
  let lastSkyUpdate = -Infinity;
  let lastWidth = 0;
  let lastHeight = 0;
  let frames = 0;
  let activeFrames = 0;
  let contextLost = false;
  let fallbackRectInstalled = false;
  let originalCanvasOpacity = canvas.style.opacity;

  function isActive() {
    return document.documentElement.dataset.surfaceMode === 'active' && mode.isActive?.();
  }

  function isPresenting() {
    return !contextLost && isActive();
  }

  function installFallbackThrottle() {
    if (fallbackRectInstalled) return;
    const previousRect = layer.getBoundingClientRect.bind(layer);
    layer.getBoundingClientRect = function gpuAwareSurfaceRect() {
      const rect = previousRect();
      if (!isPresenting()) return rect;
      return makeRectLike(rect, CANVAS_FALLBACK_SIZE, CANVAS_FALLBACK_SIZE);
    };
    fallbackRectInstalled = true;
  }
  installFallbackThrottle();

  function terrainAt(x, y) {
    terrainSamples++;
    return living.sampleDynamicPlanet(wrap(x, world.width), clamp(y, 0, world.height));
  }

  function waterAt(x, y) {
    waterSamples++;
    return waterCycle.sample(wrap(x, world.width), clamp(y, 0, world.height));
  }

  function surfaceColor(terrain, water) {
    let color = biomeColor(terrain);
    if (!terrain.land) return [14, 76, 118];
    const lake = clamp(water?.lake || 0, 0, 1);
    const river = clamp(water?.river || 0, 0, 1);
    const snow = clamp(water?.snowpack || 0, 0, 1);
    if (lake > 0.18) color = mixColor(color, [38, 119, 155], clamp(lake * 0.58, 0, 0.52));
    if (river > 0.12) color = mixColor(color, [45, 132, 166], clamp(river * 0.40, 0, 0.42));
    if (snow > 0.05) color = mixColor(color, [232, 242, 246], clamp(snow * 0.58, 0, 0.58));
    return color;
  }

  function waterStrengthFor(terrain, water) {
    if (!terrain.land) return 1;
    return clamp(Math.max(water?.lake || 0, (water?.river || 0) * 0.88), 0, 1);
  }

  function disposeMesh(mesh, disposeGeometry = true) {
    if (!mesh) return;
    terrainRoot.remove(mesh);
    if (disposeGeometry) mesh.geometry?.dispose?.();
  }

  function rebuildTerrain(player, now) {
    anchorX = player.x;
    anchorY = player.y;
    terrainBuiltAt = now;
    terrainBuilds++;

    disposeMesh(terrainMesh);
    disposeMesh(waterMesh);
    disposeMesh(vegetationMesh, false);
    disposeMesh(rockMesh, false);

    const segments = mobile ? TERRAIN_SEGMENTS_MOBILE : TERRAIN_SEGMENTS_DESKTOP;
    const geometry = new THREE.PlaneGeometry(PATCH_DIAMETER, PATCH_DIAMETER, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    const colors = new Float32Array(positions.count * 3);
    const waterHeights = new Float32Array(positions.count);
    const waterStrengths = new Float32Array(positions.count);

    for (let i = 0; i < positions.count; i++) {
      const localX = positions.getX(i);
      const localZ = positions.getZ(i);
      const wx = wrap(anchorX + localX, world.width);
      const wy = clamp(anchorY + localZ, 0, world.height);
      const terrain = terrainAt(wx, wy);
      const water = waterAt(wx, wy);
      const elevationY = (terrain?.elevation ?? SEA_LEVEL) * Z_SCALE;
      positions.setY(i, elevationY);

      const color = surfaceColor(terrain, water);
      colors[i * 3] = color[0] / 255;
      colors[i * 3 + 1] = color[1] / 255;
      colors[i * 3 + 2] = color[2] / 255;

      const strength = waterStrengthFor(terrain, water);
      waterStrengths[i] = strength;
      waterHeights[i] = terrain?.land ? elevationY + 0.12 : SEA_LEVEL * Z_SCALE + 0.16;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    terrainMesh = new THREE.Mesh(geometry, terrainMaterial);
    terrainMesh.frustumCulled = true;
    terrainRoot.add(terrainMesh);

    const waterGeometry = new THREE.PlaneGeometry(PATCH_DIAMETER, PATCH_DIAMETER, segments, segments);
    waterGeometry.rotateX(-Math.PI / 2);
    const waterPositions = waterGeometry.attributes.position;
    for (let i = 0; i < waterPositions.count; i++) waterPositions.setY(i, waterHeights[i]);
    waterGeometry.setAttribute('waterStrength', new THREE.BufferAttribute(waterStrengths, 1));
    waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
    waterMesh.renderOrder = 3;
    terrainRoot.add(waterMesh);

    rebuildVegetation();
    rebuildRocks();
  }

  function rebuildVegetation() {
    const cellSize = mobile ? 13 : 10;
    const cellRadius = Math.ceil(PATCH_RADIUS / cellSize);
    const matrices = [];
    const colors = [];
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const yAxis = new THREE.Vector3(0, 1, 0);

    const centerCellX = Math.floor(anchorX / cellSize);
    const centerCellY = Math.floor(anchorY / cellSize);
    for (let gy = centerCellY - cellRadius; gy <= centerCellY + cellRadius; gy++) {
      for (let gx = centerCellX - cellRadius; gx <= centerCellX + cellRadius; gx++) {
        const chanceNoise = hash2(gx, gy, seed);
        const jitterX = (hash2(gx + 37, gy - 17, seed) - 0.5) * cellSize * 0.78;
        const jitterY = (hash2(gx - 11, gy + 53, seed) - 0.5) * cellSize * 0.78;
        const wx = wrap((gx + 0.5) * cellSize + jitterX, world.width);
        const wy = clamp((gy + 0.5) * cellSize + jitterY, 0, world.height);
        const localX = shortestWrappedDelta(wx, anchorX, world.width);
        const localZ = wy - anchorY;
        if (localX * localX + localZ * localZ > PATCH_RADIUS * PATCH_RADIUS) continue;

        const terrain = terrainAt(wx, wy);
        if (!terrain?.land) continue;
        const water = waterAt(wx, wy);
        if (waterStrengthFor(terrain, water) > 0.22) continue;
        if (!['forest', 'rainforest', 'grassland', 'steppe'].includes(terrain.biome)) continue;

        const chance = terrain.biome === 'rainforest' ? 0.92 : terrain.biome === 'forest' ? 0.80 : terrain.biome === 'grassland' ? 0.42 : 0.28;
        if (chanceNoise > chance) continue;

        const heightScale = terrain.biome === 'rainforest' ? 1.28 : terrain.biome === 'forest' ? 1.0 : 0.34;
        const widthScale = terrain.biome === 'rainforest' ? 1.18 : terrain.biome === 'forest' ? 0.92 : 0.22;
        const randomScale = 0.72 + hash2(gx + 9, gy + 7, seed) * 0.72;
        position.set(localX, terrain.elevation * Z_SCALE, localZ);
        quaternion.setFromAxisAngle(yAxis, hash2(gx + 71, gy + 29, seed) * Math.PI * 2);
        scale.set(widthScale * randomScale, heightScale * randomScale, widthScale * randomScale);
        matrix.compose(position, quaternion, scale);
        matrices.push(matrix.clone());

        const c = terrain.biome === 'rainforest'
          ? new THREE.Color(0x1f7139)
          : terrain.biome === 'forest'
            ? new THREE.Color(0x3b7f42)
            : new THREE.Color(0x789a4d);
        colors.push(c);
      }
    }

    vegetationInstances = matrices.length;
    vegetationMesh = new THREE.InstancedMesh(vegetationGeometry, vegetationMaterial, Math.max(1, matrices.length));
    vegetationMesh.count = matrices.length;
    for (let i = 0; i < matrices.length; i++) {
      vegetationMesh.setMatrixAt(i, matrices[i]);
      vegetationMesh.setColorAt(i, colors[i]);
    }
    vegetationMesh.instanceMatrix.needsUpdate = true;
    if (vegetationMesh.instanceColor) vegetationMesh.instanceColor.needsUpdate = true;
    terrainRoot.add(vegetationMesh);
  }

  function rebuildRocks() {
    const cellSize = mobile ? 24 : 18;
    const cellRadius = Math.ceil(PATCH_RADIUS / cellSize);
    const matrices = [];
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    const centerCellX = Math.floor(anchorX / cellSize);
    const centerCellY = Math.floor(anchorY / cellSize);
    for (let gy = centerCellY - cellRadius; gy <= centerCellY + cellRadius; gy++) {
      for (let gx = centerCellX - cellRadius; gx <= centerCellX + cellRadius; gx++) {
        if (hash2(gx, gy, seed + 991) > 0.44) continue;
        const wx = wrap((gx + 0.5) * cellSize + (hash2(gx + 3, gy, seed) - 0.5) * cellSize * 0.7, world.width);
        const wy = clamp((gy + 0.5) * cellSize + (hash2(gx, gy + 5, seed) - 0.5) * cellSize * 0.7, 0, world.height);
        const localX = shortestWrappedDelta(wx, anchorX, world.width);
        const localZ = wy - anchorY;
        if (localX * localX + localZ * localZ > PATCH_RADIUS * PATCH_RADIUS) continue;
        const terrain = terrainAt(wx, wy);
        if (!terrain?.land || !['mountain', 'snow-mountain', 'desert', 'steppe', 'cold-desert'].includes(terrain.biome)) continue;
        const s = 0.5 + hash2(gx + 13, gy - 9, seed) * 1.9;
        position.set(localX, terrain.elevation * Z_SCALE + 0.18, localZ);
        quaternion.setFromEuler(new THREE.Euler(hash2(gx, gy, seed) * 1.4, hash2(gx + 7, gy, seed) * 6.28, hash2(gx, gy + 7, seed) * 1.4));
        scale.set(s, s * (0.55 + hash2(gx + 19, gy, seed) * 0.75), s);
        matrix.compose(position, quaternion, scale);
        matrices.push(matrix.clone());
      }
    }

    rockInstances = matrices.length;
    rockMesh = new THREE.InstancedMesh(rockGeometry, rockMaterial, Math.max(1, matrices.length));
    rockMesh.count = matrices.length;
    for (let i = 0; i < matrices.length; i++) rockMesh.setMatrixAt(i, matrices[i]);
    rockMesh.instanceMatrix.needsUpdate = true;
    terrainRoot.add(rockMesh);
  }

  function ensureCreatureMesh(kind, count) {
    const existing = creatureMeshes.get(kind);
    if (existing && existing.capacity >= count) return existing;
    if (existing) {
      terrainRoot.remove(existing.mesh);
      existing.mesh.dispose?.();
    }
    const capacity = Math.max(16, count, Math.ceil((existing?.capacity || 0) * 1.5));
    const mesh = new THREE.InstancedMesh(creatureGeometry, creatureMaterials[kind], capacity);
    mesh.count = 0;
    terrainRoot.add(mesh);
    const next = { mesh, capacity };
    creatureMeshes.set(kind, next);
    return next;
  }

  function gatherCreatureCandidates(player) {
    const indexed = window.realitySandboxSurfacePerformance?.queryNearbyCreatures?.(player.x, player.y, CREATURE_RADIUS);
    if (Array.isArray(indexed)) return indexed;
    const results = [];
    const { position, agent, predator, apex } = world.ecs.components;
    const groups = { agent, predator, apex };
    const radiusSq = CREATURE_RADIUS * CREATURE_RADIUS;
    for (const [kind, collection] of Object.entries(groups)) {
      for (const [id] of collection.entries()) {
        const pos = position.get(id);
        if (!pos) continue;
        const dx = shortestWrappedDelta(pos.x, player.x, world.width);
        const dy = pos.y - player.y;
        if (dx * dx + dy * dy <= radiusSq) results.push({ id, kind });
      }
    }
    return results;
  }

  function updateCreatures(player, now) {
    if (now - lastCreatureUpdate < CREATURE_UPDATE_MS) return;
    lastCreatureUpdate = now;
    creatureUpdates++;

    const { position, velocity } = world.ecs.components;
    const candidates = gatherCreatureCandidates(player);
    const grouped = { agent: [], predator: [], apex: [] };
    for (const candidate of candidates) {
      if (grouped[candidate.kind]) grouped[candidate.kind].push(candidate.id);
    }

    visibleCreatures = 0;
    const matrix = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const yAxis = new THREE.Vector3(0, 1, 0);

    for (const [kind, ids] of Object.entries(grouped)) {
      const holder = ensureCreatureMesh(kind, ids.length);
      let used = 0;
      const baseScale = kind === 'apex' ? 1.55 : kind === 'predator' ? 1.22 : 0.96;
      for (const id of ids) {
        const pos = position.get(id);
        if (!pos) continue;
        const localX = shortestWrappedDelta(pos.x, anchorX, world.width);
        const localZ = pos.y - anchorY;
        if (localX * localX + localZ * localZ > CREATURE_RADIUS * CREATURE_RADIUS) continue;
        const terrain = terrainAt(pos.x, pos.y);
        if (!terrain?.land) continue;
        const vel = velocity?.get?.(id);
        const heading = vel ? Math.atan2(vel.vy || 0, vel.vx || 0) : 0;
        p.set(localX, terrain.elevation * Z_SCALE + 0.8 * baseScale, localZ);
        q.setFromAxisAngle(yAxis, -heading);
        s.set(baseScale * 1.15, baseScale * 0.72, baseScale * 1.75);
        matrix.compose(p, q, s);
        holder.mesh.setMatrixAt(used++, matrix);
      }
      holder.mesh.count = used;
      holder.mesh.instanceMatrix.needsUpdate = true;
      visibleCreatures += used;
    }
    document.documentElement.dataset.surfaceModeVisibleCreatures = String(visibleCreatures);
  }

  function resize() {
    const width = Math.max(1, layer.clientWidth || innerWidth || 1);
    const height = Math.max(1, layer.clientHeight || innerHeight || 1);
    if (width === lastWidth && height === lastHeight) return;
    lastWidth = width;
    lastHeight = height;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    document.documentElement.dataset.surfaceGpuResolution = `${Math.round(width * renderer.getPixelRatio())}x${Math.round(height * renderer.getPixelRatio())}`;
  }

  function updateSky(player, now) {
    if (now - lastSkyUpdate < SKY_UPDATE_MS) return;
    lastSkyUpdate = now;
    const water = waterAt(player.x, player.y);
    const cloud = clamp(water?.cloud || 0, 0, 1);
    const rain = clamp((water?.rain || 0) * 7, 0, 1);
    const clear = new THREE.Color(0x6f9fb0);
    const storm = new THREE.Color(0x667174);
    scene.background = clear.clone().lerp(storm, clamp(cloud * 0.72 + rain * 0.28, 0, 0.9));
    scene.fog.color.copy(scene.background).lerp(new THREE.Color(0x879b91), 0.24);
    hemi.intensity = 1.58 - cloud * 0.38 - rain * 0.22;
    sun.intensity = 2.45 - cloud * 1.05 - rain * 0.48;
  }

  function updateCamera(player) {
    const localX = shortestWrappedDelta(player.x, anchorX, world.width);
    const localZ = player.y - anchorY;
    const terrain = living.sampleDynamicPlanet(wrap(player.x, world.width), clamp(player.y, 0, world.height));
    const groundY = (terrain?.land ? terrain.elevation : SEA_LEVEL) * Z_SCALE;
    const eyeY = groundY + player.altitude;
    camera.position.set(localX, eyeY, localZ);

    const horizontal = Math.cos(player.pitch);
    const dx = Math.cos(player.yaw) * horizontal;
    const dz = Math.sin(player.yaw) * horizontal;
    const dy = -Math.sin(player.pitch);
    camera.lookAt(localX + dx * 18, eyeY + dy * 18, localZ + dz * 18);
  }

  function syncPresentation(active) {
    if (active && !contextLost) {
      renderer.domElement.style.display = 'block';
      if (canvas.style.opacity !== '0') {
        originalCanvasOpacity = canvas.style.opacity;
        canvas.style.opacity = '0';
      }
      document.documentElement.dataset.surfaceGpu = 'active';
    } else {
      renderer.domElement.style.display = 'none';
      canvas.style.opacity = originalCanvasOpacity;
      document.documentElement.dataset.surfaceGpu = contextLost ? 'fallback-context-lost' : 'ready';
    }
  }

  function loop(now) {
    requestAnimationFrame(loop);
    frames++;
    const active = isActive() && !contextLost;
    syncPresentation(active);
    if (!active) return;
    activeFrames++;

    resize();
    const player = mode.getPlayer();
    if (!player) return;

    const dx = Number.isFinite(anchorX) ? shortestWrappedDelta(player.x, anchorX, world.width) : Infinity;
    const dy = Number.isFinite(anchorY) ? player.y - anchorY : Infinity;
    if (
      !terrainMesh ||
      dx * dx + dy * dy >= TERRAIN_REBUILD_DISTANCE * TERRAIN_REBUILD_DISTANCE ||
      now - terrainBuiltAt >= TERRAIN_REFRESH_MS
    ) {
      rebuildTerrain(player, now);
    }

    updateCamera(player);
    updateCreatures(player, now);
    updateSky(player, now);
    waterMaterial.uniforms.time.value = now * 0.001;
    renderer.render(scene, camera);
  }

  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    contextLost = true;
    syncPresentation(false);
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    terrainBuiltAt = -Infinity;
    document.documentElement.dataset.surfaceGpu = 'ready';
  });

  const api = {
    installed: true,
    isPresenting,
    rebuild: () => {
      terrainBuiltAt = -Infinity;
      return true;
    },
    getStats: () => ({
      strategy: 'threejs-gpu-heightfield-instancing',
      renderer: 'WebGLRenderer',
      threeRevision: THREE.REVISION,
      gpuPrimary: true,
      canvasFallbackBuffer: `${CANVAS_FALLBACK_SIZE}x${CANVAS_FALLBACK_SIZE}`,
      mobile,
      contextLost,
      active: isPresenting(),
      frames,
      activeFrames,
      terrainBuilds,
      terrainSamples,
      waterSamples,
      terrainSegments: mobile ? TERRAIN_SEGMENTS_MOBILE : TERRAIN_SEGMENTS_DESKTOP,
      patchRadius: PATCH_RADIUS,
      vegetationInstances,
      rockInstances,
      visibleCreatures,
      creatureUpdates,
      rendererInfo: {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        points: renderer.info.render.points,
        lines: renderer.info.render.lines,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
      },
      resolution: document.documentElement.dataset.surfaceGpuResolution || 'unknown',
    }),
  };

  window.realitySandboxSurfaceGpu = api;
  document.documentElement.dataset.surfaceGpu = 'ready';
  document.documentElement.dataset.surfaceGpuPrimary = 'true';

  const previousDiagnostics = window.realitySandboxPresentationDiagnostics;
  window.realitySandboxPresentationDiagnostics = () => ({
    ...(typeof previousDiagnostics === 'function' ? previousDiagnostics() : {}),
    surfaceGpu: api.getStats(),
  });

  requestAnimationFrame(loop);
}

async function boot() {
  const state = await waitForSurfaceRuntime();
  if (!state) {
    document.documentElement.dataset.surfaceGpu = 'unavailable';
    return;
  }
  installSurfaceGpu(state);
}

boot();
