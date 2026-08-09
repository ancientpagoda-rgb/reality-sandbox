import * as THREE from 'three';

const UPDATE_MS = 1000 / 20;
const NEAR_RENDER_RADIUS = 175;
const FRONT_TARGET = 8;
const FRONT_MIN_RADIUS = 28;
const FRONT_MAX_RADIUS = 105;
const FRONT_HALF_ANGLE = Math.PI * 0.34;
const TILE_HALF = 210;
const TERRAIN_MARGIN = 8;
const Z_SCALE = 62;
const SEA_LEVEL = 0.53;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (v, max) => ((v % max) + max) % max;

function wrappedDelta(value, origin, size) {
  let d = value - origin;
  if (d > size * 0.5) d -= size;
  else if (d < -size * 0.5) d += size;
  return d;
}

function normalizeSpherePoint(x, y, world) {
  let sx = x;
  let sy = y;
  while (sy < 0 || sy > world.height) {
    if (sy < 0) {
      sy = -sy;
      sx += world.width * 0.5;
    } else {
      sy = world.height - (sy - world.height);
      sx += world.width * 0.5;
    }
  }
  return { x: wrap(sx, world.width), y: clamp(sy, 0, world.height) };
}

function hash01(value) {
  let h = Math.imul((value | 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function nextCapacity(count) {
  let capacity = 8;
  while (capacity < Math.max(1, count)) capacity *= 2;
  return capacity;
}

async function waitForRuntime() {
  for (let i = 0; i < 420; i++) {
    const planet = window.realitySandboxPlanet;
    const mode = window.realitySandboxSurfaceMode;
    const surface = window.realitySandboxSurfaceSphereV37;
    const objects = window.realitySandboxSurfaceLightHookV36?.getObjects?.();
    if (
      planet?.world?.ecs?.components &&
      planet?.living?.sampleDynamicPlanet &&
      mode?.getPlayer && mode?.isActive &&
      surface?.getStats &&
      objects?.scene && objects?.camera
    ) return { planet, mode, surface, scene: objects.scene, camera: objects.camera };
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  return null;
}

function install({ planet, mode, surface, scene, camera }) {
  if (window.realitySandboxSurfaceFaunaGuaranteeV45b?.installed) return;

  const { world, living } = planet;
  const { ecs } = world;
  const { position, velocity, agent, predator, apex } = ecs.components;
  const seed = window.realitySandboxSeed?.numericSeed || 734221;
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const matrix = new THREE.Matrix4();

  const stats = {
    frontSeeded: false,
    frontBefore: 0,
    frontAfter: 0,
    frontSpawned: 0,
    seedTerrainSamples: 0,
    seedLandRejects: 0,
    updates: 0,
    terrainMeshAcquisitions: 0,
    exactGroundSamples: 0,
    renderedAgents: 0,
    renderedPredators: 0,
    renderedApex: 0,
    nearestRenderedDistance: null,
    capacityGrowths: 0,
    renderLoopProceduralSamples: 0,
  };

  const geometries = {
    agent: new THREE.DodecahedronGeometry(1, 0),
    predator: new THREE.ConeGeometry(1, 3.0, 6),
    apex: new THREE.OctahedronGeometry(1, 0),
  };
  geometries.predator.rotateZ(-Math.PI / 2);

  const materials = {
    agent: new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true, depthTest: true, depthWrite: true }),
    predator: new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true, depthTest: true, depthWrite: true }),
    apex: new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true, depthTest: true, depthWrite: true }),
  };

  const groups = {
    agent: { mesh: null, capacity: 0 },
    predator: { mesh: null, capacity: 0 },
    apex: { mesh: null, capacity: 0 },
  };

  let nearTerrain = null;
  let lastUpdate = -Infinity;

  function surfaceActive() {
    return Boolean(mode.isActive?.() && document.documentElement.dataset.surfaceMode === 'active');
  }

  function activeAnchor() {
    const s = surface.getStats();
    const parts = String(s.activeChunkKey || '').split(':').map(Number);
    if (parts.length !== 2 || !parts.every(Number.isFinite)) return null;
    return {
      x: wrap((parts[0] + 0.5) * s.chunkStride, world.width),
      y: clamp((parts[1] + 0.5) * s.chunkStride, 0, world.height),
    };
  }

  function findNearTerrain() {
    if (nearTerrain?.parent && nearTerrain.visible) return nearTerrain;
    nearTerrain = null;
    let bestSegments = -1;
    for (const child of scene.children) {
      if (!child?.isMesh || child.geometry?.type !== 'PlaneGeometry') continue;
      if (!child.material?.isMeshStandardMaterial || !child.material?.vertexColors) continue;
      if (child.geometry?.getAttribute?.('waterStrength')) continue;
      if (Math.abs(child.position.x) > 0.5 || Math.abs(child.position.z) > 0.5) continue;
      const count = child.geometry?.getAttribute?.('position')?.count || 0;
      const side = Math.round(Math.sqrt(count));
      const segments = side > 1 && side * side === count ? side - 1 : 0;
      if (segments > bestSegments) {
        nearTerrain = child;
        bestSegments = segments;
      }
    }
    if (nearTerrain) stats.terrainMeshAcquisitions++;
    return nearTerrain;
  }

  function exactGround(localX, localZ) {
    const terrain = findNearTerrain();
    if (!terrain) return null;
    if (Math.abs(localX) > TILE_HALF - TERRAIN_MARGIN || Math.abs(localZ) > TILE_HALF - TERRAIN_MARGIN) return null;
    const attr = terrain.geometry?.getAttribute?.('position');
    const count = attr?.count || 0;
    const side = Math.round(Math.sqrt(count));
    if (!attr || side < 2 || side * side !== count) return null;
    const segments = side - 1;
    const u = clamp((localX + TILE_HALF) / (TILE_HALF * 2), 0, 1) * segments;
    const v = clamp((localZ + TILE_HALF) / (TILE_HALF * 2), 0, 1) * segments;
    const x0 = Math.floor(u);
    const z0 = Math.floor(v);
    const x1 = Math.min(segments, x0 + 1);
    const z1 = Math.min(segments, z0 + 1);
    const tx = u - x0;
    const tz = v - z0;
    const at = (x, z) => attr.getY(z * side + x);
    const a = at(x0, z0) * (1 - tx) + at(x1, z0) * tx;
    const b = at(x0, z1) * (1 - tx) + at(x1, z1) * tx;
    stats.exactGroundSamples++;
    return a * (1 - tz) + b * tz;
  }

  function ensureGroup(role, count) {
    const group = groups[role];
    if (group.mesh && count <= group.capacity) return group.mesh;
    const capacity = nextCapacity(count);
    if (group.mesh) {
      scene.remove(group.mesh);
      group.mesh.dispose?.();
    }
    const mesh = new THREE.InstancedMesh(geometries[role], materials[role], capacity);
    mesh.name = `surfaceFaunaGuarantee-${role}-v45b`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = 7;
    mesh.count = 0;
    scene.add(mesh);
    group.mesh = mesh;
    group.capacity = capacity;
    stats.capacityGrowths++;
    return mesh;
  }

  function frontCount(player) {
    const fx = Math.cos(player.yaw || 0);
    const fz = Math.sin(player.yaw || 0);
    let count = 0;
    for (const [id] of agent.entries()) {
      const p = position.get(id);
      if (!p) continue;
      const dx = wrappedDelta(p.x, player.x, world.width);
      const dz = p.y - player.y;
      const distance = Math.hypot(dx, dz);
      if (distance < FRONT_MIN_RADIUS || distance > FRONT_MAX_RADIUS * 1.15) continue;
      const dot = (dx * fx + dz * fz) / Math.max(1, distance);
      if (dot >= Math.cos(FRONT_HALF_ANGLE)) count++;
    }
    return count;
  }

  function candidateInFront(player, serial) {
    const baseYaw = Number(player.yaw) || 0;
    for (let attempt = 0; attempt < 8; attempt++) {
      const angle = baseYaw + (hash01(seed + serial * 1031 + attempt * 47) - 0.5) * FRONT_HALF_ANGLE * 1.6;
      const radius = FRONT_MIN_RADIUS + hash01(seed + serial * 4099 + attempt * 71) * (FRONT_MAX_RADIUS - FRONT_MIN_RADIUS);
      const point = normalizeSpherePoint(
        player.x + Math.cos(angle) * radius,
        player.y + Math.sin(angle) * radius,
        world,
      );
      const terrain = living.sampleDynamicPlanet(point.x, point.y, 'surface-fauna-guarantee-v45b');
      stats.seedTerrainSamples++;
      if (terrain?.land !== false && !['ice', 'snow-mountain'].includes(terrain?.biome)) return point;
      stats.seedLandRejects++;
    }
    return normalizeSpherePoint(
      player.x + Math.cos(baseYaw) * (FRONT_MIN_RADIUS + 24),
      player.y + Math.sin(baseYaw) * (FRONT_MIN_RADIUS + 24),
      world,
    );
  }

  function spawnFrontAgent(player, serial) {
    const p = candidateInFront(player, serial);
    const id = ecs.createEntity();
    const angle = (Number(player.yaw) || 0) + (hash01(seed + serial * 131) - 0.5) * 0.8;
    const speedTrait = 0.82 + hash01(seed + serial * 137) * 0.36;
    const sense = 0.84 + hash01(seed + serial * 139) * 0.34;
    const metabolism = 0.82 + hash01(seed + serial * 149) * 0.34;
    const hueShift = Math.round((hash01(seed + serial * 151) - 0.5) * 64);
    position.set(id, p);
    velocity.set(id, { vx: Math.cos(angle) * 18 * speedTrait, vy: Math.sin(angle) * 18 * speedTrait });
    const dna = { speed: speedTrait, sense, metabolism, hueShift };
    agent.set(id, {
      colorHue: 175 + hueShift,
      energy: 1.25,
      age: 2 + hash01(seed + serial * 157) * 3,
      dna,
      evolved: false,
      caste: sense > speedTrait ? 'scout' : 'balanced',
      origin: 'surface-forward-habitat-herd',
    });
    stats.frontSpawned++;
  }

  function seedFrontHerd() {
    if (stats.frontSeeded || world.__surfaceFrontHerdSeededV45b || !surfaceActive()) return;
    const player = mode.getPlayer();
    stats.frontBefore = frontCount(player);
    const needed = Math.max(0, FRONT_TARGET - stats.frontBefore);
    for (let i = 0; i < needed; i++) spawnFrontAgent(player, 5000 + i);
    stats.frontAfter = frontCount(player);
    stats.frontSeeded = true;
    world.__surfaceFrontHerdSeededV45b = true;
    document.documentElement.dataset.surfaceFrontHerdV45b = String(stats.frontAfter);
  }

  function setInstance(mesh, index, role, localX, ground, localZ, organism, vel) {
    const speed = Math.hypot(vel?.vx || 0, vel?.vy || 0);
    const yaw = speed > 0.01 ? -Math.atan2(vel.vy, vel.vx) : 0;
    const dna = organism?.dna || { speed: 1, sense: 1, metabolism: 1 };
    if (role === 'agent') {
      dummy.position.set(localX, ground + 3.1, localZ);
      dummy.scale.set(5.2 + dna.speed * 1.2, 3.0, 2.8 + dna.sense * 0.5);
    } else if (role === 'predator') {
      dummy.position.set(localX, ground + 3.8, localZ);
      dummy.scale.set(4.0 + dna.speed * 1.0, 3.4 + dna.sense * 0.5, 3.3);
    } else {
      dummy.position.set(localX, ground + 5.0, localZ);
      dummy.scale.set(5.8, 5.2, 5.5);
    }
    dummy.rotation.set(0, yaw, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    const hue = ((Number(organism?.colorHue) || (role === 'agent' ? 165 : role === 'predator' ? 18 : 220)) % 360 + 360) % 360;
    color.setHSL(hue / 360, role === 'predator' ? 0.90 : 0.78, role === 'apex' ? 0.67 : 0.58);
    mesh.setColorAt(index, color);
  }

  function renderRole(role, map, anchor, player) {
    const candidates = [];
    for (const [id, organism] of map.entries()) {
      const p = position.get(id);
      if (!p) continue;
      const dxPlayer = wrappedDelta(p.x, player.x, world.width);
      const dzPlayer = p.y - player.y;
      const distance = Math.hypot(dxPlayer, dzPlayer);
      if (distance > NEAR_RENDER_RADIUS) continue;
      const localX = wrappedDelta(p.x, anchor.x, world.width);
      const localZ = p.y - anchor.y;
      if (Math.abs(localX) > TILE_HALF - TERRAIN_MARGIN || Math.abs(localZ) > TILE_HALF - TERRAIN_MARGIN) continue;
      const ground = exactGround(localX, localZ);
      if (!Number.isFinite(ground)) continue;
      candidates.push({ id, organism, p, localX, localZ, ground, distance });
    }

    const mesh = ensureGroup(role, candidates.length);
    let index = 0;
    for (const item of candidates) {
      setInstance(mesh, index, role, item.localX, item.ground, item.localZ, item.organism, velocity.get(item.id));
      index++;
    }
    mesh.count = index;
    mesh.visible = surfaceActive();
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return { count: index, nearest: candidates.reduce((best, item) => Math.min(best, item.distance), Infinity) };
  }

  function hideAll() {
    for (const group of Object.values(groups)) if (group.mesh) group.mesh.visible = false;
  }

  function loop(now) {
    requestAnimationFrame(loop);
    if (!surfaceActive()) {
      hideAll();
      return;
    }
    seedFrontHerd();
    if (now - lastUpdate < UPDATE_MS) return;
    lastUpdate = now;
    const anchor = activeAnchor();
    if (!anchor || !findNearTerrain()) return;
    const player = mode.getPlayer();
    const a = renderRole('agent', agent, anchor, player);
    const p = renderRole('predator', predator, anchor, player);
    const x = renderRole('apex', apex, anchor, player);
    stats.renderedAgents = a.count;
    stats.renderedPredators = p.count;
    stats.renderedApex = x.count;
    const nearest = Math.min(a.nearest, p.nearest, x.nearest);
    stats.nearestRenderedDistance = Number.isFinite(nearest) ? nearest : null;
    stats.updates++;
    document.documentElement.dataset.surfaceGuaranteedFaunaV45b = String(a.count + p.count + x.count);
  }
  requestAnimationFrame(loop);

  const api = {
    installed: true,
    getStats: () => ({
      ...stats,
      active: surfaceActive(),
      frontTarget: FRONT_TARGET,
      frontMinRadius: FRONT_MIN_RADIUS,
      frontMaxRadius: FRONT_MAX_RADIUS,
      nearRenderRadius: NEAR_RENDER_RADIUS,
      actualEcsPositions: true,
      exactRenderedTerrainGrounding: true,
      unlitReadableMorphology: true,
      depthTested: true,
      gpuInstancing: true,
      drawCalls: 3,
      oneTimeFrontSeed: true,
      realEcsCreatures: true,
      globalPopulationCap: false,
      globalDisplayCap: false,
      proceduralSamplingInRenderLoop: false,
      renderLoopProceduralSamples: 0,
      cameraDistance: camera?.position?.length?.() ?? null,
    }),
  };

  window.realitySandboxSurfaceFaunaGuaranteeV45b = api;
  document.documentElement.dataset.surfaceFaunaGuaranteeV45b = 'real-ecs-grounded-forward-visible';
  const prev = window.realitySandboxPresentationDiagnostics;
  window.realitySandboxPresentationDiagnostics = () => ({
    ...(typeof prev === 'function' ? prev() : {}),
    surfaceFaunaGuaranteeV45b: api.getStats(),
  });
}

waitForRuntime().then(state => {
  if (!state) {
    document.documentElement.dataset.surfaceFaunaGuaranteeV45b = 'unavailable';
    return;
  }
  install(state);
});
