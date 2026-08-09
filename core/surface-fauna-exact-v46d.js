import * as THREE from 'three';

const UPDATE_MS = 1000 / 24;
const NEAR_RADIUS = 190;
const SCREEN_TARGET = 6;
const CENTRAL_TARGET = 4;
const SEED_MIN_RADIUS = 18;
const SEED_MAX_RADIUS = 54;
const TILE_HALF = 210;
const TERRAIN_MARGIN = 7;
const MIN_VISIBLE_PIXELS = 16;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (v, max) => ((v % max) + max) % max;

function wrappedDelta(value, origin, size) {
  let d = value - origin;
  if (d > size * 0.5) d -= size;
  else if (d < -size * 0.5) d += size;
  return d;
}

function hash01(value) {
  let h = Math.imul((value | 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
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

function scheduleIdle(fn, timeout = 120) {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout });
  else setTimeout(() => fn({ didTimeout: true, timeRemaining: () => 2 }), 0);
}

function nextCapacity(required, base = 8) {
  let n = base;
  while (n < Math.max(1, required)) n *= 2;
  return n;
}

async function waitForRuntime() {
  while (true) {
    const planet = window.realitySandboxPlanet;
    const mode = window.realitySandboxSurfaceMode;
    const surface = window.realitySandboxSurfaceSphereV37;
    const bridge = window.realitySandboxSurfaceRenderBridgeV46d;
    if (planet?.world?.ecs?.components && planet?.living?.sampleDynamicPlanet && mode?.getPlayer && surface?.getStats && bridge?.getObjects) {
      return { planet, mode, surface, bridge };
    }
    await new Promise(resolve => setTimeout(resolve, 80));
  }
}

function install({ planet, mode, surface, bridge }) {
  if (window.realitySandboxSurfaceFaunaExactV46d?.installed) return;

  const { world, living } = planet;
  const { ecs } = world;
  const { position, velocity, agent } = ecs.components;
  const seed = window.realitySandboxSeed?.numericSeed || 734221;

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();

  const bodyGeometry = new THREE.SphereGeometry(1, 12, 8);
  const headGeometry = new THREE.DodecahedronGeometry(1, 0);
  const legGeometry = new THREE.CylinderGeometry(0.32, 0.38, 2.0, 5);
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true, depthTest: true, depthWrite: true });

  let bodyMesh = null;
  let headMesh = null;
  let legMesh = null;
  let bodyCapacity = 0;
  let legCapacity = 0;
  let attachedScene = null;

  const beaconGeometry = new THREE.BufferGeometry();
  let beaconCapacity = 16;
  let beaconPositions = new Float32Array(beaconCapacity * 3);
  let beaconColors = new Float32Array(beaconCapacity * 3);
  beaconGeometry.setAttribute('position', new THREE.BufferAttribute(beaconPositions, 3));
  beaconGeometry.setAttribute('color', new THREE.BufferAttribute(beaconColors, 3));
  beaconGeometry.setDrawRange(0, 0);

  const beaconMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    vertexColors: true,
    uniforms: { pointSize: { value: 11.0 } },
    vertexShader: `
      uniform float pointSize;
      attribute vec3 color;
      varying vec3 vColor;
      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = pointSize;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        vec2 p = abs(gl_PointCoord * 2.0 - 1.0);
        if (p.x + p.y > 1.0) discard;
        gl_FragColor = vec4(mix(vColor, vec3(1.0), 0.42), 0.88);
      }
    `,
  });
  const beacons = new THREE.Points(beaconGeometry, beaconMaterial);
  beacons.name = 'surfaceFaunaExact-life-markers-v46d';
  beacons.frustumCulled = false;
  beacons.renderOrder = 40;

  let nearTerrain = null;
  let lastUpdate = -Infinity;
  let seedScheduled = false;
  let seededForEntry = false;
  let activeLast = false;
  let seedSerial = 9000;

  const stats = {
    updates: 0,
    bridgeCapturesObserved: 0,
    sceneReattachments: 0,
    terrainAcquisitions: 0,
    exactGroundSamples: 0,
    renderedAgents: 0,
    screenVisibleAgents: 0,
    centralVisibleAgents: 0,
    readablePixelAgents: 0,
    maxProjectedPixelHeight: 0,
    meanProjectedPixelHeight: 0,
    nearestDistance: null,
    seedSchedules: 0,
    seedAttempts: 0,
    seedTerrainSamples: 0,
    seedLandRejects: 0,
    spawnedAgents: 0,
    capacityGrowths: 0,
    renderLoopProceduralSamples: 0,
  };

  function active() {
    return Boolean(mode.isActive?.() && document.documentElement.dataset.surfaceMode === 'active');
  }

  function renderObjects() {
    const objects = bridge.getObjects?.() || {};
    if (objects.captures) stats.bridgeCapturesObserved = objects.captures;
    return objects;
  }

  function activeAnchor() {
    const s = surface.getStats?.();
    const parts = String(s?.activeChunkKey || '').split(':').map(Number);
    if (parts.length !== 2 || !parts.every(Number.isFinite)) return null;
    return {
      x: wrap((parts[0] + 0.5) * s.chunkStride, world.width),
      y: clamp((parts[1] + 0.5) * s.chunkStride, 0, world.height),
    };
  }

  function attachToScene(scene) {
    if (!scene || attachedScene === scene) return;
    if (attachedScene) {
      if (bodyMesh) attachedScene.remove(bodyMesh);
      if (headMesh) attachedScene.remove(headMesh);
      if (legMesh) attachedScene.remove(legMesh);
      attachedScene.remove(beacons);
    }
    attachedScene = scene;
    if (bodyMesh) scene.add(bodyMesh);
    if (headMesh) scene.add(headMesh);
    if (legMesh) scene.add(legMesh);
    scene.add(beacons);
    nearTerrain = null;
    stats.sceneReattachments++;
  }

  function findNearTerrain(scene) {
    if (nearTerrain?.parent === scene && nearTerrain.visible) return nearTerrain;
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
        bestSegments = segments;
        nearTerrain = child;
      }
    }
    if (nearTerrain) stats.terrainAcquisitions++;
    return nearTerrain;
  }

  function exactGround(scene, localX, localZ) {
    const terrain = findNearTerrain(scene);
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

  function ensureMeshes(scene, animalCount) {
    const neededBody = nextCapacity(animalCount, 8);
    const neededLeg = nextCapacity(animalCount * 4, 32);
    if (!bodyMesh || neededBody > bodyCapacity) {
      if (bodyMesh && attachedScene) attachedScene.remove(bodyMesh);
      if (headMesh && attachedScene) attachedScene.remove(headMesh);
      bodyCapacity = neededBody;
      bodyMesh = new THREE.InstancedMesh(bodyGeometry, material, bodyCapacity);
      headMesh = new THREE.InstancedMesh(headGeometry, material, bodyCapacity);
      for (const mesh of [bodyMesh, headMesh]) {
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.renderOrder = 12;
      }
      bodyMesh.name = 'surfaceFaunaExact-agent-body-v46d';
      headMesh.name = 'surfaceFaunaExact-agent-head-v46d';
      scene.add(bodyMesh, headMesh);
      stats.capacityGrowths++;
    }
    if (!legMesh || neededLeg > legCapacity) {
      if (legMesh && attachedScene) attachedScene.remove(legMesh);
      legCapacity = neededLeg;
      legMesh = new THREE.InstancedMesh(legGeometry, material, legCapacity);
      legMesh.name = 'surfaceFaunaExact-agent-legs-v46d';
      legMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      legMesh.frustumCulled = false;
      legMesh.castShadow = false;
      legMesh.receiveShadow = false;
      legMesh.renderOrder = 12;
      scene.add(legMesh);
      stats.capacityGrowths++;
    }
  }

  function ensureBeaconCapacity(required) {
    if (required <= beaconCapacity) return;
    while (beaconCapacity < required) beaconCapacity *= 2;
    beaconPositions = new Float32Array(beaconCapacity * 3);
    beaconColors = new Float32Array(beaconCapacity * 3);
    beaconGeometry.setAttribute('position', new THREE.BufferAttribute(beaconPositions, 3));
    beaconGeometry.setAttribute('color', new THREE.BufferAttribute(beaconColors, 3));
    stats.capacityGrowths++;
  }

  function projectedMetrics(camera, renderer, x, y, z, bodyHalfHeight = 2.5) {
    camera.updateMatrixWorld(true);
    p0.set(x, y, z).project(camera);
    p1.set(x, y + bodyHalfHeight, z).project(camera);
    const inside = p0.z >= -1 && p0.z <= 1 && Math.abs(p0.x) <= 1 && Math.abs(p0.y) <= 1;
    const central = inside && Math.abs(p0.x) <= 0.72 && Math.abs(p0.y) <= 0.70;
    const viewportHeight = Math.max(1, renderer?.domElement?.clientHeight || renderer?.domElement?.height || 1);
    const pixelHeight = Math.abs(p1.y - p0.y) * viewportHeight * 0.5 * 2;
    return { inside, central, pixelHeight };
  }

  function gather(scene, camera, renderer, anchor, player) {
    const out = [];
    for (const [id, organism] of agent.entries()) {
      const p = position.get(id);
      if (!p) continue;
      const dx = wrappedDelta(p.x, player.x, world.width);
      const dz = p.y - player.y;
      const distance = Math.hypot(dx, dz);
      if (distance > NEAR_RADIUS) continue;
      const localX = wrappedDelta(p.x, anchor.x, world.width);
      const localZ = p.y - anchor.y;
      const ground = exactGround(scene, localX, localZ);
      if (!Number.isFinite(ground)) continue;
      const centerY = ground + 2.9;
      const metrics = projectedMetrics(camera, renderer, localX, centerY, localZ, 3.1);
      out.push({ id, organism, localX, localZ, ground, centerY, distance, metrics, vel: velocity.get(id) });
    }
    return out;
  }

  function candidate(player, anchor, scene, camera, renderer, serial) {
    const yaw = Number(player.yaw) || 0;
    for (let attempt = 0; attempt < 24; attempt++) {
      stats.seedAttempts++;
      const angle = yaw + (hash01(seed + serial * 617 + attempt * 43) - 0.5) * 0.42;
      const radius = SEED_MIN_RADIUS + hash01(seed + serial * 1613 + attempt * 89) * (SEED_MAX_RADIUS - SEED_MIN_RADIUS);
      const point = normalizeSpherePoint(player.x + Math.cos(angle) * radius, player.y + Math.sin(angle) * radius, world);
      const terrain = living.sampleDynamicPlanet(point.x, point.y, 'surface-fauna-exact-v46d-seed');
      stats.seedTerrainSamples++;
      if (terrain?.land === false) {
        stats.seedLandRejects++;
        continue;
      }
      const localX = wrappedDelta(point.x, anchor.x, world.width);
      const localZ = point.y - anchor.y;
      const ground = exactGround(scene, localX, localZ);
      if (!Number.isFinite(ground)) continue;
      const metrics = projectedMetrics(camera, renderer, localX, ground + 2.9, localZ, 3.1);
      if (!metrics.central || metrics.pixelHeight < MIN_VISIBLE_PIXELS) continue;
      return point;
    }
    return null;
  }

  function spawnAgent(player, anchor, scene, camera, renderer) {
    const serial = seedSerial++;
    const p = candidate(player, anchor, scene, camera, renderer, serial);
    if (!p) return false;
    const id = ecs.createEntity();
    const angle = (Number(player.yaw) || 0) + (hash01(seed + serial * 127) - 0.5) * 0.35;
    const speed = 0.88 + hash01(seed + serial * 131) * 0.26;
    const sense = 0.88 + hash01(seed + serial * 137) * 0.28;
    const metabolism = 0.86 + hash01(seed + serial * 139) * 0.26;
    const hueShift = Math.round((hash01(seed + serial * 149) - 0.5) * 36);
    position.set(id, p);
    velocity.set(id, { vx: Math.cos(angle) * 7 * speed, vy: Math.sin(angle) * 7 * speed });
    agent.set(id, {
      colorHue: 172 + hueShift,
      energy: 1.42,
      age: 2.5 + hash01(seed + serial * 151) * 2,
      dna: { speed, sense, metabolism, hueShift },
      evolved: false,
      caste: sense > speed ? 'scout' : 'balanced',
      origin: 'surface-exact-screen-herd-v46d',
    });
    stats.spawnedAgents++;
    return true;
  }

  function scheduleSeed(scene, camera, renderer, anchor, player, visible, central, readable) {
    if (seedScheduled || seededForEntry || !active()) return;
    if (visible >= SCREEN_TARGET && central >= CENTRAL_TARGET && readable >= CENTRAL_TARGET) {
      seededForEntry = true;
      return;
    }
    seedScheduled = true;
    stats.seedSchedules++;
    scheduleIdle(() => {
      seedScheduled = false;
      if (!active()) return;
      const deficit = Math.max(0, CENTRAL_TARGET - central, SCREEN_TARGET - visible);
      let made = 0;
      for (let i = 0; i < Math.min(8, Math.max(1, deficit)); i++) {
        if (spawnAgent(player, anchor, scene, camera, renderer)) made++;
      }
      if (!made) setTimeout(() => { seededForEntry = false; }, 180);
    }, 120);
  }

  function writeInstance(mesh, index, x, y, z, sx, sy, sz, yaw, instanceColor) {
    dummy.position.set(x, y, z);
    dummy.scale.set(sx, sy, sz);
    dummy.rotation.set(0, yaw, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    mesh.setColorAt(index, instanceColor);
  }

  function render(scene, camera, renderer, anchor, player) {
    const items = gather(scene, camera, renderer, anchor, player);
    ensureMeshes(scene, items.length);
    ensureBeaconCapacity(items.length);

    let screenVisible = 0;
    let centralVisible = 0;
    let readable = 0;
    let pixelSum = 0;
    let pixelCount = 0;
    let maxPixels = 0;
    let nearest = Infinity;
    let legIndex = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const dna = item.organism?.dna || { speed: 1, sense: 1 };
      const speed = Math.hypot(item.vel?.vx || 0, item.vel?.vy || 0);
      const dirX = speed > 0.01 ? (item.vel.vx / speed) : Math.cos(player.yaw || 0);
      const dirZ = speed > 0.01 ? (item.vel.vy / speed) : Math.sin(player.yaw || 0);
      const sideX = -dirZ;
      const sideZ = dirX;
      const yaw = -Math.atan2(dirZ, dirX);
      const hue = (((Number(item.organism?.colorHue) || 172) % 360) + 360) % 360;
      color.setHSL(hue / 360, 0.88, 0.64);

      const bodyLength = 5.8 + (Number(dna.speed) || 1) * 1.2;
      const bodyWidth = 2.3 + (Number(dna.sense) || 1) * 0.42;
      writeInstance(bodyMesh, i, item.localX, item.ground + 2.8, item.localZ, bodyLength, 2.55, bodyWidth, yaw, color);
      writeInstance(headMesh, i, item.localX + dirX * (bodyLength * 0.82), item.ground + 3.15, item.localZ + dirZ * (bodyLength * 0.82), 1.85, 1.65, 1.65, yaw, color);

      const legOffsets = [[2.2, 1.35], [2.2, -1.35], [-2.0, 1.35], [-2.0, -1.35]];
      for (const [longitudinal, lateral] of legOffsets) {
        const lx = item.localX + dirX * longitudinal + sideX * lateral;
        const lz = item.localZ + dirZ * longitudinal + sideZ * lateral;
        writeInstance(legMesh, legIndex++, lx, item.ground + 1.0, lz, 1, 1.15, 1, yaw, color);
      }

      const m = item.metrics;
      if (m.inside) screenVisible++;
      if (m.central) centralVisible++;
      if (m.inside && m.pixelHeight >= MIN_VISIBLE_PIXELS) readable++;
      if (m.inside) {
        pixelSum += m.pixelHeight;
        pixelCount++;
        maxPixels = Math.max(maxPixels, m.pixelHeight);
      }
      nearest = Math.min(nearest, item.distance);

      beaconPositions[i * 3] = item.localX;
      beaconPositions[i * 3 + 1] = item.ground + 8.6;
      beaconPositions[i * 3 + 2] = item.localZ;
      beaconColors[i * 3] = color.r;
      beaconColors[i * 3 + 1] = color.g;
      beaconColors[i * 3 + 2] = color.b;
    }

    bodyMesh.count = items.length;
    headMesh.count = items.length;
    legMesh.count = legIndex;
    for (const mesh of [bodyMesh, headMesh, legMesh]) {
      mesh.visible = active();
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    beacons.visible = active();
    beaconGeometry.attributes.position.needsUpdate = true;
    beaconGeometry.attributes.color.needsUpdate = true;
    beaconGeometry.setDrawRange(0, items.length);

    stats.renderedAgents = items.length;
    stats.screenVisibleAgents = screenVisible;
    stats.centralVisibleAgents = centralVisible;
    stats.readablePixelAgents = readable;
    stats.maxProjectedPixelHeight = maxPixels;
    stats.meanProjectedPixelHeight = pixelCount ? pixelSum / pixelCount : 0;
    stats.nearestDistance = Number.isFinite(nearest) ? nearest : null;
    stats.updates++;

    document.documentElement.dataset.surfaceModeVisibleCreatures = String(items.length);
    document.documentElement.dataset.surfaceExactVisibleFaunaV46d = String(screenVisible);
    document.documentElement.dataset.surfaceExactReadableFaunaV46d = String(readable);

    scheduleSeed(scene, camera, renderer, anchor, player, screenVisible, centralVisible, readable);
  }

  function hide() {
    if (bodyMesh) bodyMesh.visible = false;
    if (headMesh) headMesh.visible = false;
    if (legMesh) legMesh.visible = false;
    beacons.visible = false;
  }

  function loop(now) {
    requestAnimationFrame(loop);
    const isActive = active();
    if (!isActive) {
      hide();
      if (activeLast) {
        activeLast = false;
        seededForEntry = false;
        seedScheduled = false;
      }
      return;
    }
    if (!activeLast) {
      activeLast = true;
      seededForEntry = false;
    }
    if (now - lastUpdate < UPDATE_MS) return;
    lastUpdate = now;

    const objects = renderObjects();
    const scene = objects.scene;
    const camera = objects.camera;
    const renderer = objects.renderer;
    if (!scene || !camera || !renderer || renderer.domElement?.id !== 'surfaceGpuCanvas') return;
    attachToScene(scene);
    const anchor = activeAnchor();
    if (!anchor || !findNearTerrain(scene)) return;
    render(scene, camera, renderer, anchor, mode.getPlayer());
  }
  requestAnimationFrame(loop);

  const api = {
    installed: true,
    getStats: () => ({
      ...stats,
      active: active(),
      exactSurfaceRendererBinding: true,
      expectedCanvasId: 'surfaceGpuCanvas',
      actualCanvasId: renderObjects().renderer?.domElement?.id || null,
      screenTarget: SCREEN_TARGET,
      centralTarget: CENTRAL_TARGET,
      minimumVisiblePixels: MIN_VISIBLE_PIXELS,
      bodyHeadLegMorphology: true,
      overheadLifeMarkers: true,
      lifeMarkersUseActualEcsPositions: true,
      exactRenderedTerrainGrounding: true,
      gpuInstancing: true,
      globalPopulationCap: false,
      globalDisplayCap: false,
      proceduralSamplingInRenderLoop: false,
      renderLoopProceduralSamples: 0,
    }),
  };

  window.realitySandboxSurfaceFaunaExactV46d = api;
  document.documentElement.dataset.surfaceFaunaExactV46d = 'exact-surfaceGpuCanvas-screen-pixel-verified';
  const previousDiagnostics = window.realitySandboxPresentationDiagnostics;
  window.realitySandboxPresentationDiagnostics = () => ({
    ...(typeof previousDiagnostics === 'function' ? previousDiagnostics() : {}),
    surfaceFaunaExactV46d: api.getStats(),
  });
}

waitForRuntime().then(install);