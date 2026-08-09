import * as THREE from 'three';

const UPDATE_MS = 1000 / 20;
const NEAR_RENDER_RADIUS = 185;
const VIEWPORT_TARGET = 8;
const VIEWPORT_MIN_RADIUS = 22;
const VIEWPORT_MAX_RADIUS = 78;
const VIEWPORT_HALF_ANGLE = Math.PI * 0.30;
const TILE_HALF = 210;
const TERRAIN_MARGIN = 8;

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

function scheduleIdle(fn, timeout = 120) {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout });
  else setTimeout(() => fn({ didTimeout: true, timeRemaining: () => 2 }), 0);
}

async function waitForRuntime() {
  // Deliberately no expiry. Older fauna builds timed out before the Three camera
  // existed if the user waited ~17 seconds before entering Surface Mode.
  while (true) {
    const planet = window.realitySandboxPlanet;
    const mode = window.realitySandboxSurfaceMode;
    const surface = window.realitySandboxSurfaceSphereV37;
    const scene = window.realitySandboxSurfaceLightHookV36?.getObjects?.()?.scene;
    if (
      planet?.world?.ecs?.components &&
      planet?.living?.sampleDynamicPlanet &&
      mode?.getPlayer && mode?.isActive &&
      surface?.getStats && scene
    ) return { planet, mode, surface, scene };
    await new Promise(resolve => setTimeout(resolve, 80));
  }
}

function install({ planet, mode, surface, scene }) {
  if (window.realitySandboxSurfaceFaunaGuaranteeV45b?.installed) return;

  const { world, living } = planet;
  const { ecs } = world;
  const { position, velocity, agent, predator, apex } = ecs.components;
  const seed = window.realitySandboxSeed?.numericSeed || 734221;
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const projected = new THREE.Vector3();

  const stats = {
    viewportSeeded: false,
    viewportBefore: 0,
    viewportAfter: 0,
    viewportSpawned: 0,
    viewportSeedAttempts: 0,
    seedTerrainSamples: 0,
    seedLandRejects: 0,
    updates: 0,
    terrainMeshAcquisitions: 0,
    exactGroundSamples: 0,
    renderedAgents: 0,
    renderedPredators: 0,
    renderedApex: 0,
    screenVisibleAgents: 0,
    screenVisiblePredators: 0,
    screenVisibleApex: 0,
    centralVisibleAgents: 0,
    nearestRenderedDistance: null,
    capacityGrowths: 0,
    cameraAcquisitions: 0,
    seedSchedules: 0,
    renderLoopProceduralSamples: 0,
  };

  // Unlit faceted silhouettes are intentionally unmistakable against any lighting state.
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
  let seedScheduled = false;
  let lastCamera = null;

  function surfaceActive() {
    return Boolean(mode.isActive?.() && document.documentElement.dataset.surfaceMode === 'active');
  }

  function getCamera() {
    const camera = window.realitySandboxSurfaceLightHookV36?.getObjects?.()?.camera || null;
    if (camera && camera !== lastCamera) {
      lastCamera = camera;
      stats.cameraAcquisitions++;
    }
    return camera;
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

  function bodyCenterY(role, ground) {
    return ground + (role === 'apex' ? 5.4 : role === 'predator' ? 4.2 : 3.8);
  }

  function projectPoint(x, y, z, central = false) {
    const camera = getCamera();
    if (!camera) return false;
    camera.updateMatrixWorld(true);
    projected.set(x, y, z).project(camera);
    const xLimit = central ? 0.76 : 1.0;
    const yLimit = central ? 0.72 : 1.0;
    return projected.z >= -1 && projected.z <= 1 && Math.abs(projected.x) <= xLimit && Math.abs(projected.y) <= yLimit;
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
    mesh.name = `surfaceFaunaGuarantee-${role}-v46c`;
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

  function agentViewportCount(anchor) {
    let count = 0;
    for (const [id] of agent.entries()) {
      const p = position.get(id);
      if (!p) continue;
      const localX = wrappedDelta(p.x, anchor.x, world.width);
      const localZ = p.y - anchor.y;
      if (Math.abs(localX) > TILE_HALF - TERRAIN_MARGIN || Math.abs(localZ) > TILE_HALF - TERRAIN_MARGIN) continue;
      const ground = exactGround(localX, localZ);
      if (!Number.isFinite(ground)) continue;
      if (projectPoint(localX, bodyCenterY('agent', ground), localZ, true)) count++;
    }
    return count;
  }

  function viewportCandidate(player, anchor, serial) {
    const baseYaw = Number(player.yaw) || 0;
    for (let attempt = 0; attempt < 18; attempt++) {
      stats.viewportSeedAttempts++;
      const angle = baseYaw + (hash01(seed + serial * 1031 + attempt * 47) - 0.5) * VIEWPORT_HALF_ANGLE * 1.7;
      const radius = VIEWPORT_MIN_RADIUS + hash01(seed + serial * 4099 + attempt * 71) * (VIEWPORT_MAX_RADIUS - VIEWPORT_MIN_RADIUS);
      const point = normalizeSpherePoint(
        player.x + Math.cos(angle) * radius,
        player.y + Math.sin(angle) * radius,
        world,
      );
      const terrain = living.sampleDynamicPlanet(point.x, point.y, 'surface-fauna-viewport-v46c');
      stats.seedTerrainSamples++;
      if (terrain?.land === false || ['ice', 'snow-mountain'].includes(terrain?.biome)) {
        stats.seedLandRejects++;
        continue;
      }
      const localX = wrappedDelta(point.x, anchor.x, world.width);
      const localZ = point.y - anchor.y;
      const ground = exactGround(localX, localZ);
      if (!Number.isFinite(ground)) continue;
      if (!projectPoint(localX, bodyCenterY('agent', ground), localZ, true)) continue;
      return point;
    }
    return null;
  }

  function spawnViewportAgent(player, anchor, serial) {
    const p = viewportCandidate(player, anchor, serial);
    if (!p) return false;
    const id = ecs.createEntity();
    const angle = (Number(player.yaw) || 0) + (hash01(seed + serial * 131) - 0.5) * 0.55;
    const speedTrait = 0.84 + hash01(seed + serial * 137) * 0.32;
    const sense = 0.86 + hash01(seed + serial * 139) * 0.31;
    const metabolism = 0.84 + hash01(seed + serial * 149) * 0.30;
    const hueShift = Math.round((hash01(seed + serial * 151) - 0.5) * 50);
    position.set(id, p);
    velocity.set(id, { vx: Math.cos(angle) * 12 * speedTrait, vy: Math.sin(angle) * 12 * speedTrait });
    const dna = { speed: speedTrait, sense, metabolism, hueShift };
    agent.set(id, {
      colorHue: 168 + hueShift,
      energy: 1.34,
      age: 2 + hash01(seed + serial * 157) * 3,
      dna,
      evolved: false,
      caste: sense > speedTrait ? 'scout' : 'balanced',
      origin: 'surface-screen-verified-habitat-herd',
    });
    stats.viewportSpawned++;
    return true;
  }

  function scheduleViewportSeed() {
    if (stats.viewportSeeded || world.__surfaceViewportHerdSeededV46c || seedScheduled || !surfaceActive()) return;
    seedScheduled = true;
    stats.seedSchedules++;
    scheduleIdle(() => {
      seedScheduled = false;
      if (!surfaceActive()) return;
      const anchor = activeAnchor();
      const camera = getCamera();
      if (!anchor || !camera || !findNearTerrain()) {
        setTimeout(scheduleViewportSeed, 120);
        return;
      }
      const player = mode.getPlayer();
      stats.viewportBefore = agentViewportCount(anchor);
      const needed = Math.max(0, VIEWPORT_TARGET - stats.viewportBefore);
      for (let i = 0; i < needed; i++) spawnViewportAgent(player, anchor, 7000 + i);
      stats.viewportAfter = agentViewportCount(anchor);
      // Do not permanently suppress retries unless the viewport guarantee was actually met.
      if (stats.viewportAfter >= Math.min(5, VIEWPORT_TARGET)) {
        stats.viewportSeeded = true;
        world.__surfaceViewportHerdSeededV46c = true;
      } else {
        setTimeout(scheduleViewportSeed, 180);
      }
      document.documentElement.dataset.surfaceViewportHerdV46c = String(stats.viewportAfter);
    }, 160);
  }

  function setInstance(mesh, index, role, localX, ground, localZ, organism, vel) {
    const speed = Math.hypot(vel?.vx || 0, vel?.vy || 0);
    const yaw = speed > 0.01 ? -Math.atan2(vel.vy, vel.vx) : 0;
    const dna = organism?.dna || { speed: 1, sense: 1, metabolism: 1 };
    if (role === 'agent') {
      dummy.position.set(localX, bodyCenterY(role, ground), localZ);
      dummy.scale.set(7.4 + dna.speed * 1.4, 4.2, 3.8 + dna.sense * 0.6);
    } else if (role === 'predator') {
      dummy.position.set(localX, bodyCenterY(role, ground), localZ);
      dummy.scale.set(5.3 + dna.speed * 1.2, 4.4 + dna.sense * 0.5, 4.0);
    } else {
      dummy.position.set(localX, bodyCenterY(role, ground), localZ);
      dummy.scale.set(7.0, 6.3, 6.6);
    }
    dummy.rotation.set(0, yaw, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    const fallbackHue = role === 'agent' ? 165 : role === 'predator' ? 18 : 275;
    const hue = ((Number(organism?.colorHue) || fallbackHue) % 360 + 360) % 360;
    color.setHSL(hue / 360, role === 'predator' ? 0.96 : 0.86, role === 'apex' ? 0.72 : 0.62);
    mesh.setColorAt(index, color);
  }

  function renderRole(role, map, anchor, player) {
    const candidates = [];
    let screenVisible = 0;
    let centralVisible = 0;
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
      const centerY = bodyCenterY(role, ground);
      if (projectPoint(localX, centerY, localZ, false)) screenVisible++;
      if (projectPoint(localX, centerY, localZ, true)) centralVisible++;
      candidates.push({ id, organism, localX, localZ, ground, distance });
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
    return {
      count: index,
      screenVisible,
      centralVisible,
      nearest: candidates.reduce((best, item) => Math.min(best, item.distance), Infinity),
    };
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

    scheduleViewportSeed();
    if (now - lastUpdate < UPDATE_MS) return;
    lastUpdate = now;
    const anchor = activeAnchor();
    if (!anchor || !findNearTerrain() || !getCamera()) return;
    const player = mode.getPlayer();
    const a = renderRole('agent', agent, anchor, player);
    const p = renderRole('predator', predator, anchor, player);
    const x = renderRole('apex', apex, anchor, player);
    stats.renderedAgents = a.count;
    stats.renderedPredators = p.count;
    stats.renderedApex = x.count;
    stats.screenVisibleAgents = a.screenVisible;
    stats.screenVisiblePredators = p.screenVisible;
    stats.screenVisibleApex = x.screenVisible;
    stats.centralVisibleAgents = a.centralVisible;
    const nearest = Math.min(a.nearest, p.nearest, x.nearest);
    stats.nearestRenderedDistance = Number.isFinite(nearest) ? nearest : null;
    stats.updates++;
    document.documentElement.dataset.surfaceGuaranteedFaunaV46c = String(a.count + p.count + x.count);
    document.documentElement.dataset.surfaceScreenVisibleFaunaV46c = String(a.screenVisible + p.screenVisible + x.screenVisible);
    // Keep the original HUD's nearby-life display honest instead of letting v37 pin it to zero.
    document.documentElement.dataset.surfaceModeVisibleCreatures = String(a.count + p.count + x.count);
  }
  requestAnimationFrame(loop);

  const api = {
    installed: true,
    getStats: () => ({
      ...stats,
      active: surfaceActive(),
      viewportTarget: VIEWPORT_TARGET,
      viewportMinRadius: VIEWPORT_MIN_RADIUS,
      viewportMaxRadius: VIEWPORT_MAX_RADIUS,
      nearRenderRadius: NEAR_RENDER_RADIUS,
      actualEcsPositions: true,
      exactRenderedTerrainGrounding: true,
      unlitReadableMorphology: true,
      screenSpaceVerified: true,
      startupTimeoutRemoved: true,
      lazyCameraAcquisition: true,
      depthTested: true,
      gpuInstancing: true,
      drawCalls: 3,
      oneTimeViewportSeed: true,
      realEcsCreatures: true,
      globalPopulationCap: false,
      globalDisplayCap: false,
      proceduralSamplingInRenderLoop: false,
      renderLoopProceduralSamples: 0,
      cameraReady: Boolean(getCamera()),
    }),
  };

  window.realitySandboxSurfaceFaunaGuaranteeV45b = api;
  window.realitySandboxSurfaceFaunaGuaranteeV46c = api;
  document.documentElement.dataset.surfaceFaunaGuaranteeV45b = 'screen-verified-real-ecs-v46c';
  document.documentElement.dataset.surfaceFaunaGuaranteeV46c = 'screen-verified-real-ecs';
  const prev = window.realitySandboxPresentationDiagnostics;
  window.realitySandboxPresentationDiagnostics = () => ({
    ...(typeof prev === 'function' ? prev() : {}),
    surfaceFaunaGuaranteeV45b: api.getStats(),
    surfaceFaunaGuaranteeV46c: api.getStats(),
  });
}

waitForRuntime().then(install);
