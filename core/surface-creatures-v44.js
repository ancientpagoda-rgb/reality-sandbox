import * as THREE from 'three';

const CELL_SIZE = 64;
const SIM_INTERVAL = 1 / 8;
const RENDER_INTERVAL_MS = 1000 / 30;
const NEAR_RADIUS = 480;
const MID_RADIUS = 1100;
const TERRAIN_CELL = 8;
const TERRAIN_CACHE_LIMIT = 8192;
const Z_SCALE = 62;
const SEA_LEVEL = 0.53;
const EPS = 1e-6;

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

function nextCapacity(count) {
  let capacity = 8;
  while (capacity < Math.max(1, count)) capacity *= 2;
  return capacity;
}

async function waitForRuntime() {
  for (let i = 0; i < 360; i++) {
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
  if (window.realitySandboxSurfaceCreaturesV44?.installed) return;

  const { world, living } = planet;
  const { ecs } = world;
  const { position, velocity, agent, predator, apex, resource, forceField } = ecs.components;
  const seed = window.realitySandboxSeed?.numericSeed || 734221;
  const curvatureRadius = Number(surface.getStats().curvatureRadius) || 26400;
  const cols = Math.max(1, Math.ceil(world.width / CELL_SIZE));
  const rows = Math.max(1, Math.ceil(world.height / CELL_SIZE));
  const terrainCache = new Map();
  const buckets = new Map();
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);

  let accumulator = 0;
  let lastNow = performance.now();
  let lastRenderUpdate = -Infinity;
  let ecologyTick = 0;
  let lastSimAt = performance.now();
  let activeLast = false;

  const stats = {
    simulationTicks: 0,
    renderUpdates: 0,
    spatialRebuilds: 0,
    spatialQueries: 0,
    neighborCandidates: 0,
    collisionPairs: 0,
    births: 0,
    deaths: 0,
    herbivoreKills: 0,
    predatorKills: 0,
    resourceBites: 0,
    terrainSamples: 0,
    terrainCacheHits: 0,
    terrainCacheMisses: 0,
    terrainCacheEvictions: 0,
    capacityGrowths: 0,
    nearDecisionUpdates: 0,
    midDecisionUpdates: 0,
    farDecisionUpdates: 0,
    renderedAgents: 0,
    renderedPredators: 0,
    renderedApex: 0,
    renderLoopProceduralSamples: 0,
  };

  const geometries = {
    agentBody: new THREE.SphereGeometry(1, 8, 6),
    agentHead: new THREE.SphereGeometry(1, 7, 5),
    predatorBody: new THREE.ConeGeometry(1, 3.8, 6),
    predatorCrest: new THREE.ConeGeometry(1, 1.8, 5),
    apexBody: new THREE.DodecahedronGeometry(1, 0),
    apexCrown: new THREE.ConeGeometry(1, 2.2, 6),
  };
  geometries.predatorBody.rotateZ(-Math.PI / 2);
  geometries.predatorCrest.rotateZ(-Math.PI / 2);
  geometries.apexCrown.rotateZ(-Math.PI / 2);

  const materials = {
    agentBody: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0 }),
    agentHead: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0 }),
    predatorBody: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0 }),
    predatorCrest: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, metalness: 0 }),
    apexBody: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.68, metalness: 0.04 }),
    apexCrown: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.64, metalness: 0.02 }),
  };

  const groups = {
    agent: { capacity: 0, body: null, detail: null, bodyKey: 'agentBody', detailKey: 'agentHead' },
    predator: { capacity: 0, body: null, detail: null, bodyKey: 'predatorBody', detailKey: 'predatorCrest' },
    apex: { capacity: 0, body: null, detail: null, bodyKey: 'apexBody', detailKey: 'apexCrown' },
  };

  function surfaceActive() {
    return Boolean(mode.isActive?.() && document.documentElement.dataset.surfaceMode === 'active');
  }

  function sphereSag(x, z) {
    const d2 = x * x + z * z;
    const r2 = curvatureRadius * curvatureRadius;
    return curvatureRadius - Math.sqrt(Math.max(1, r2 - Math.min(d2, r2 - 1)));
  }

  function anchor() {
    const s = surface.getStats();
    const parts = String(s.activeChunkKey || '').split(':').map(Number);
    if (parts.length !== 2 || !parts.every(Number.isFinite)) return null;
    return {
      x: wrap((parts[0] + 0.5) * s.chunkStride, world.width),
      y: clamp((parts[1] + 0.5) * s.chunkStride, 0, world.height),
    };
  }

  function cellCoords(x, y) {
    return {
      cx: ((Math.floor(x / CELL_SIZE) % cols) + cols) % cols,
      cy: ((Math.floor(y / CELL_SIZE) % rows) + rows) % rows,
    };
  }

  function cellKey(cx, cy) {
    return `${((cx % cols) + cols) % cols}:${((cy % rows) + rows) % rows}`;
  }

  function insertSpatial(id, type, pos, data = null) {
    const { cx, cy } = cellCoords(pos.x, pos.y);
    const key = cellKey(cx, cy);
    let bucket = buckets.get(key);
    if (!bucket) buckets.set(key, bucket = []);
    bucket.push({ id, type, pos, data });
  }

  function rebuildSpatial() {
    buckets.clear();
    for (const [id, data] of agent.entries()) {
      const pos = position.get(id);
      if (pos) insertSpatial(id, 'agent', pos, data);
    }
    for (const [id, data] of predator.entries()) {
      const pos = position.get(id);
      if (pos) insertSpatial(id, 'predator', pos, data);
    }
    for (const [id, data] of apex.entries()) {
      const pos = position.get(id);
      if (pos) insertSpatial(id, 'apex', pos, data);
    }
    for (const [id, data] of resource.entries()) {
      if ((data.amount ?? 0) <= 0) continue;
      const pos = position.get(id);
      if (pos) insertSpatial(id, 'resource', pos, data);
    }
    stats.spatialRebuilds++;
  }

  function queryNearby(pos, radius, type = null) {
    stats.spatialQueries++;
    const out = [];
    const { cx, cy } = cellCoords(pos.x, pos.y);
    const cellRadius = Math.ceil(radius / CELL_SIZE);
    const radius2 = radius * radius;
    const visited = new Set();
    for (let oy = -cellRadius; oy <= cellRadius; oy++) {
      for (let ox = -cellRadius; ox <= cellRadius; ox++) {
        const key = cellKey(cx + ox, cy + oy);
        if (visited.has(key)) continue;
        visited.add(key);
        const bucket = buckets.get(key);
        if (!bucket) continue;
        for (const item of bucket) {
          if (type && item.type !== type) continue;
          const dx = wrappedDelta(item.pos.x, pos.x, world.width);
          const dy = wrappedDelta(item.pos.y, pos.y, world.height);
          const d2 = dx * dx + dy * dy;
          stats.neighborCandidates++;
          if (d2 <= radius2) out.push({ ...item, dx, dy, d2 });
        }
      }
    }
    return out;
  }

  function nearest(pos, radius, type, excludeId = -1) {
    let best = null;
    for (const item of queryNearby(pos, radius, type)) {
      if (item.id === excludeId) continue;
      if (!best || item.d2 < best.d2) best = item;
    }
    return best;
  }

  function distanceToPlayer(pos, player) {
    const dx = wrappedDelta(pos.x, player.x, world.width);
    const dy = wrappedDelta(pos.y, player.y, world.height);
    return Math.hypot(dx, dy);
  }

  function decisionStride(pos, player) {
    const d = distanceToPlayer(pos, player);
    if (d <= NEAR_RADIUS) return 1;
    if (d <= MID_RADIUS) return 2;
    return 5;
  }

  function shouldDecide(pos, player, id) {
    const stride = decisionStride(pos, player);
    if (stride === 1) stats.nearDecisionUpdates++;
    else if (stride === 2) stats.midDecisionUpdates++;
    else stats.farDecisionUpdates++;
    return ((ecologyTick + id) % stride) === 0;
  }

  function randomFor(id, salt = 0) {
    return hash01(seed + Math.imul(id + 1, 73856093) + Math.imul(ecologyTick + 1, 19349663) + salt * 83492791);
  }

  function mutate(value, id, salt, amount, min, max) {
    return clamp(value + (randomFor(id, salt) - 0.5) * amount, min, max);
  }

  function spawnAgent(parentId, parentPos, parentVel, parent) {
    const id = ecs.createEntity();
    const dna = parent?.dna || { speed: 1, sense: 1, metabolism: 1, hueShift: 0 };
    const childDna = {
      speed: mutate(dna.speed, id, 1, 0.10, 0.6, 1.4),
      sense: mutate(dna.sense, id, 2, 0.10, 0.6, 1.4),
      metabolism: mutate(dna.metabolism, id, 3, 0.10, 0.6, 1.6),
      hueShift: clamp((dna.hueShift || 0) + Math.round((randomFor(id, 4) - 0.5) * 8), -60, 60),
    };
    const jx = (randomFor(id, 5) - 0.5) * 8;
    const jy = (randomFor(id, 6) - 0.5) * 8;
    position.set(id, { x: wrap(parentPos.x + jx, world.width), y: wrap(parentPos.y + jy, world.height) });
    velocity.set(id, { vx: parentVel.vx + jx, vy: parentVel.vy + jy });
    const evolvedScore = childDna.speed + childDna.sense + (2 - childDna.metabolism);
    let caste = 'balanced';
    if (childDna.sense > childDna.speed && childDna.sense > 1.1) caste = 'scout';
    else if (childDna.speed > childDna.sense && childDna.speed > 1.1) caste = 'runner';
    else if (childDna.metabolism < 0.9) caste = 'saver';
    agent.set(id, {
      colorHue: parent?.colorHue ?? 200,
      energy: Math.max(0.25, (parent?.energy || 1) * 0.5),
      age: 0,
      dna: childDna,
      evolved: evolvedScore > 3.5,
      caste,
    });
    stats.births++;
    return id;
  }

  function spawnPredator(parentPos, parentVel, parent) {
    const id = ecs.createEntity();
    const dna = parent?.dna || { speed: 1, sense: 1, metabolism: 1, hueShift: 0 };
    const childDna = {
      speed: mutate(dna.speed, id, 10, 0.22, 0.45, 2.0),
      sense: mutate(dna.sense, id, 11, 0.22, 0.35, 2.1),
      metabolism: mutate(dna.metabolism, id, 12, 0.22, 0.4, 2.2),
      hueShift: clamp((dna.hueShift || 0) + Math.round((randomFor(id, 13) - 0.5) * 16), -80, 80),
    };
    const jx = (randomFor(id, 14) - 0.5) * 10;
    const jy = (randomFor(id, 15) - 0.5) * 10;
    position.set(id, { x: wrap(parentPos.x + jx, world.width), y: wrap(parentPos.y + jy, world.height) });
    velocity.set(id, { vx: parentVel.vx + jx, vy: parentVel.vy + jy });
    predator.set(id, { colorHue: parent?.colorHue ?? 20, energy: Math.max(0.5, (parent?.energy || 2) * 0.5), age: 0, rest: 0, dna: childDna });
    stats.births++;
    return id;
  }

  function spawnApex(parentPos, parentVel, parent) {
    const id = ecs.createEntity();
    const dna = parent?.dna || { speed: 1, sense: 1.2, metabolism: 1, hueShift: 0 };
    const childDna = {
      speed: mutate(dna.speed, id, 20, 0.08, 0.5, 1.4),
      sense: mutate(dna.sense, id, 21, 0.08, 0.7, 1.8),
      metabolism: mutate(dna.metabolism, id, 22, 0.08, 0.5, 1.6),
      hueShift: clamp((dna.hueShift || 0) + Math.round((randomFor(id, 23) - 0.5) * 6), -30, 30),
    };
    const jx = (randomFor(id, 24) - 0.5) * 12;
    const jy = (randomFor(id, 25) - 0.5) * 12;
    position.set(id, { x: wrap(parentPos.x + jx, world.width), y: wrap(parentPos.y + jy, world.height) });
    velocity.set(id, { vx: parentVel.vx + jx, vy: parentVel.vy + jy });
    apex.set(id, { colorHue: parent?.colorHue ?? 200, energy: Math.max(0.8, (parent?.energy || 3) * 0.55), age: 0, rest: 0, dna: childDna });
    stats.births++;
    return id;
  }

  function applySteering(dt, player) {
    for (const [id, ag] of agent.entries()) {
      const pos = position.get(id);
      const vel = velocity.get(id);
      if (!pos || !vel || !shouldDecide(pos, player, id)) continue;
      const dna = ag.dna || { speed: 1, sense: 1, metabolism: 1 };
      const target = nearest(pos, 140 * dna.sense, 'resource');
      if (target) {
        const dist = Math.sqrt(target.d2) || 1;
        const speed = 40 * dna.speed;
        const desiredVx = target.dx / dist * speed;
        const desiredVy = target.dy / dist * speed;
        vel.vx = vel.vx * 0.8 + desiredVx * 0.2;
        vel.vy = vel.vy * 0.8 + desiredVy * 0.2;
      }
      let ax = 0;
      let ay = 0;
      for (const other of queryNearby(pos, 18, 'agent')) {
        if (other.id === id || other.d2 <= EPS) continue;
        const dist = Math.sqrt(other.d2) || 1;
        const strength = (18 - dist) / 18;
        ax -= other.dx / dist * strength * 30;
        ay -= other.dy / dist * strength * 30;
      }
      vel.vx += ax * dt;
      vel.vy += ay * dt;
    }

    for (const [id, pred] of predator.entries()) {
      const pos = position.get(id);
      const vel = velocity.get(id);
      if (!pos || !vel || (pred.rest || 0) > 0 || !shouldDecide(pos, player, id)) continue;
      const dna = pred.dna || { speed: 1, sense: 1, metabolism: 1 };
      const target = nearest(pos, 200 * dna.sense, 'agent');
      if (!target) continue;
      const aggression = clamp(dna.speed + dna.sense - dna.metabolism, 0.2, 1.4);
      const dist = Math.sqrt(target.d2) || 1;
      const speed = 60 * dna.speed * (0.8 + aggression * 0.25);
      const desiredVx = target.dx / dist * speed;
      const desiredVy = target.dy / dist * speed;
      const blend = clamp(0.65 + aggression * 0.1, 0.65, 0.82);
      vel.vx = vel.vx * blend + desiredVx * (1 - blend);
      vel.vy = vel.vy * blend + desiredVy * (1 - blend);
    }

    for (const [id, ap] of apex.entries()) {
      const pos = position.get(id);
      const vel = velocity.get(id);
      if (!pos || !vel || (ap.rest || 0) > 0 || !shouldDecide(pos, player, id)) continue;
      const dna = ap.dna || { speed: 1, sense: 1, metabolism: 1 };
      const target = nearest(pos, 260 * dna.sense, 'predator');
      if (!target) continue;
      const dist = Math.sqrt(target.d2) || 1;
      const speed = 55 * dna.speed;
      vel.vx = vel.vx * 0.8 + target.dx / dist * speed * 0.2;
      vel.vy = vel.vy * 0.8 + target.dy / dist * speed * 0.2;
    }
  }

  function applyCollisions(dt) {
    const dynamics = [];
    for (const [id, ag] of agent.entries()) dynamics.push({ id, type: 'agent', data: ag, radius: 4 + (ag.energy ?? 1) * 2 });
    for (const [id, pred] of predator.entries()) dynamics.push({ id, type: 'predator', data: pred, radius: 6 + (pred.energy ?? 1.5) * 2.5 });
    for (const [id, ap] of apex.entries()) dynamics.push({ id, type: 'apex', data: ap, radius: 9 + (ap.energy ?? 3) * 2 });

    for (const a of dynamics) {
      const apos = position.get(a.id);
      const avel = velocity.get(a.id);
      if (!apos || !avel) continue;
      for (const b of queryNearby(apos, a.radius + 18)) {
        if (b.id <= a.id || b.type === 'resource') continue;
        const bvel = velocity.get(b.id);
        if (!bvel || b.d2 <= EPS) continue;
        let br = 8;
        if (b.type === 'agent') br = 4 + (agent.get(b.id)?.energy ?? 1) * 2;
        else if (b.type === 'predator') br = 6 + (predator.get(b.id)?.energy ?? 1.5) * 2.5;
        else if (b.type === 'apex') br = 9 + (apex.get(b.id)?.energy ?? 3) * 2;
        const minDist = a.radius + br;
        if (b.d2 >= minDist * minDist) continue;
        const dist = Math.sqrt(b.d2) || 1;
        const overlap = (minDist - dist) / minDist;
        const nx = b.dx / dist;
        const ny = b.dy / dist;
        const impulse = 40 * overlap;
        avel.vx -= nx * impulse * dt;
        avel.vy -= ny * impulse * dt;
        bvel.vx += nx * impulse * dt;
        bvel.vy += ny * impulse * dt;
        stats.collisionPairs++;
      }
    }
  }

  function applyForceFields(dt) {
    if (!forceField?.size) return;
    for (const [fid, field] of forceField.entries()) {
      const fpos = position.get(fid);
      if (!fpos) continue;
      const candidates = queryNearby(fpos, field.radius || 80);
      for (const item of candidates) {
        if (item.type === 'resource' || item.id === fid || item.d2 <= EPS) continue;
        const vel = velocity.get(item.id);
        if (!vel) continue;
        const dist = Math.sqrt(item.d2) || 1;
        const direction = (field.strength || 0) >= 0 ? -1 : 1;
        const impulse = (1 - dist / Math.max(1, field.radius || 80)) * Math.abs(field.strength || 0);
        vel.vx += item.dx / dist * direction * impulse * dt;
        vel.vy += item.dy / dist * direction * impulse * dt;
      }
    }
  }

  function integrate(dt) {
    for (const [id, vel] of velocity.entries()) {
      const pos = position.get(id);
      if (!pos || (!agent.has(id) && !predator.has(id) && !apex.has(id))) continue;
      pos.x = wrap(pos.x + vel.vx * dt, world.width);
      pos.y = wrap(pos.y + vel.vy * dt, world.height);
    }
  }

  function metabolismAndEating(dt) {
    const baseDrain = 0.03 * (world.globals?.metabolism || 1);

    for (const [id, ag] of Array.from(agent.entries())) {
      const dna = ag.dna || { metabolism: 1 };
      ag.age = (ag.age || 0) + dt;
      ag.energy = Math.max(0, (ag.energy || 0) - baseDrain * dna.metabolism * dt);
      const pos = position.get(id);
      if (!pos) continue;
      const food = nearest(pos, 10, 'resource');
      if (food && resource.has(food.id)) {
        const res = resource.get(food.id);
        const bite = Math.min(0.6, res.amount || 0);
        if (bite > 0) {
          res.amount -= bite;
          ag.energy = Math.min(2.0, ag.energy + bite);
          stats.resourceBites++;
        }
      }
    }

    for (const [id, pred] of Array.from(predator.entries())) {
      const dna = pred.dna || { speed: 1, sense: 1, metabolism: 1 };
      const aggression = clamp(dna.speed + dna.sense - dna.metabolism, 0.2, 1.4);
      pred.age = (pred.age || 0) + dt;
      pred.rest = Math.max(0, (pred.rest || 0) - dt);
      const restFactor = pred.rest > 0 ? 0.4 : 1;
      pred.energy = Math.max(0, (pred.energy || 0) - baseDrain * 1.9 * dna.metabolism * (0.7 + aggression * 0.4) * dt * restFactor);
      const pos = position.get(id);
      if (pos && pred.rest <= 0) {
        const prey = nearest(pos, 9, 'agent');
        if (prey && agent.has(prey.id)) {
          ecs.destroyEntity(prey.id);
          pred.energy = Math.min(3.5, pred.energy + 1.0);
          pred.rest = 4 + randomFor(id, 30) * 3;
          stats.deaths++;
          stats.herbivoreKills++;
        }
      }
      if (pred.energy <= 0 && predator.has(id)) {
        ecs.destroyEntity(id);
        stats.deaths++;
      }
    }

    for (const [id, ap] of Array.from(apex.entries())) {
      const dna = ap.dna || { metabolism: 1 };
      ap.age = (ap.age || 0) + dt;
      ap.rest = Math.max(0, (ap.rest || 0) - dt);
      const restFactor = ap.rest > 0 ? 0.3 : 1;
      ap.energy = Math.max(0, (ap.energy || 0) - baseDrain * 1.1 * dna.metabolism * dt * restFactor);
      const pos = position.get(id);
      if (pos && ap.rest <= 0) {
        const prey = nearest(pos, 12, 'predator');
        if (prey && predator.has(prey.id)) {
          ecs.destroyEntity(prey.id);
          ap.energy = Math.min(5.0, ap.energy + 1.5);
          ap.rest = 4 + randomFor(id, 31) * 2;
          stats.deaths++;
          stats.predatorKills++;
        }
      }
      if (ap.energy <= 0 && apex.has(id)) {
        ecs.destroyEntity(id);
        stats.deaths++;
      }
    }
  }

  function resourceRegrowth(dt) {
    const fertility = world.globals?.fertility || 0.6;
    for (const res of resource.values()) {
      res.age = (res.age || 0) + dt;
      if ((res.amount ?? 1) > 0.99) continue;
      res.regenTimer = (res.regenTimer ?? 5) - dt * (0.8 + fertility * 1.2);
      if (res.regenTimer <= 0) {
        res.amount = 1;
        res.regenTimer = 6 + hash01(seed + ecologyTick + Math.round(res.age * 10)) * 4;
        res.cycles = (res.cycles || 0) + 1;
        res.age = 0;
      }
    }
  }

  function reproduce() {
    for (const [id, ag] of Array.from(agent.entries())) {
      if ((ag.energy || 0) < (world.globals?.reproductionThreshold || 1.6) || (ag.age || 0) <= 8) continue;
      const pos = position.get(id);
      const vel = velocity.get(id);
      if (!pos || !vel) continue;
      spawnAgent(id, pos, vel, ag);
      ag.energy *= 0.5;
    }
    for (const [id, pred] of Array.from(predator.entries())) {
      if ((pred.energy || 0) < 2.8 || (pred.age || 0) <= 10) continue;
      const pos = position.get(id);
      const vel = velocity.get(id);
      if (!pos || !vel) continue;
      spawnPredator(pos, vel, pred);
      pred.energy *= 0.5;
    }
    for (const [id, ap] of Array.from(apex.entries())) {
      if ((ap.energy || 0) < 3.2 || (ap.age || 0) <= 14) continue;
      const pos = position.get(id);
      const vel = velocity.get(id);
      if (!pos || !vel) continue;
      spawnApex(pos, vel, ap);
      ap.energy *= 0.55;
    }
    world.globals.reproductionThreshold = 1.6;
  }

  function ensureTerrainSamples() {
    for (const map of [agent, predator, apex]) {
      for (const [id] of map.entries()) {
        const pos = position.get(id);
        if (!pos) continue;
        const qx = Math.floor(pos.x / TERRAIN_CELL);
        const qy = Math.floor(pos.y / TERRAIN_CELL);
        const key = `${qx}:${qy}`;
        if (terrainCache.has(key)) {
          stats.terrainCacheHits++;
          continue;
        }
        stats.terrainCacheMisses++;
        const sx = wrap((qx + 0.5) * TERRAIN_CELL, world.width);
        const sy = wrap((qy + 0.5) * TERRAIN_CELL, world.height);
        const t = living.sampleDynamicPlanet(sx, sy, 'surface-creatures-v44');
        terrainCache.set(key, { elevation: t?.land ? clamp(Number(t.elevation) || SEA_LEVEL, 0, 1) : SEA_LEVEL, land: Boolean(t?.land) });
        stats.terrainSamples++;
        while (terrainCache.size > TERRAIN_CACHE_LIMIT) {
          const oldest = terrainCache.keys().next().value;
          terrainCache.delete(oldest);
          stats.terrainCacheEvictions++;
        }
      }
    }
  }

  function cachedTerrain(pos) {
    const key = `${Math.floor(pos.x / TERRAIN_CELL)}:${Math.floor(pos.y / TERRAIN_CELL)}`;
    return terrainCache.get(key) || { elevation: SEA_LEVEL, land: true };
  }

  function simulate(dt) {
    const player = mode.getPlayer();
    ecologyTick++;
    rebuildSpatial();
    applySteering(dt, player);
    applyForceFields(dt);
    applyCollisions(dt);
    integrate(dt);
    metabolismAndEating(dt);
    resourceRegrowth(dt);
    reproduce();
    ensureTerrainSamples();
    stats.simulationTicks++;
    lastSimAt = performance.now();
  }

  function makeMesh(geometry, material, capacity, name) {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.name = name;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.count = 0;
    scene.add(mesh);
    return mesh;
  }

  function ensureGroup(type, count) {
    const group = groups[type];
    if (count <= group.capacity) return group;
    const capacity = nextCapacity(count);
    if (group.body) scene.remove(group.body);
    if (group.detail) scene.remove(group.detail);
    group.body?.dispose?.();
    group.detail?.dispose?.();
    group.body = makeMesh(geometries[group.bodyKey], materials[group.bodyKey], capacity, `surfaceCreature-${type}-body-v44`);
    group.detail = makeMesh(geometries[group.detailKey], materials[group.detailKey], capacity, `surfaceCreature-${type}-detail-v44`);
    group.capacity = capacity;
    stats.capacityGrowths++;
    return group;
  }

  function setInstance(mesh, index, x, y, z, yaw, sx, sy, sz, hue, saturation, lightness) {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    color.setHSL(((hue % 360) + 360) % 360 / 360, clamp(saturation, 0, 1), clamp(lightness, 0, 1));
    mesh.setColorAt(index, color);
  }

  function renderCategory(type, map, anchorState, extrapolation) {
    const entries = Array.from(map.entries());
    const group = ensureGroup(type, entries.length);
    let index = 0;
    for (const [id, data] of entries) {
      const pos = position.get(id);
      const vel = velocity.get(id) || { vx: 0, vy: 0 };
      if (!pos) continue;
      const wx = wrap(pos.x + vel.vx * extrapolation, world.width);
      const wy = wrap(pos.y + vel.vy * extrapolation, world.height);
      const localX = wrappedDelta(wx, anchorState.x, world.width);
      const localZ = wrappedDelta(wy, anchorState.y, world.height);
      const terrain = cachedTerrain(pos);
      const ground = terrain.elevation * Z_SCALE - sphereSag(localX, localZ);
      const speed = Math.hypot(vel.vx, vel.vy);
      const yaw = speed > 0.01 ? -Math.atan2(vel.vy, vel.vx) : 0;
      const fx = speed > 0.01 ? vel.vx / speed : 1;
      const fz = speed > 0.01 ? vel.vy / speed : 0;
      const dna = data.dna || { speed: 1, sense: 1, metabolism: 1 };
      const energy = Math.max(0.15, Number(data.energy) || 0.5);
      const hue = Number(data.colorHue) || (type === 'predator' ? 20 : 200);

      if (type === 'agent') {
        const length = 1.55 + dna.speed * 0.85;
        const bodyH = 0.62 + (2 - clamp(dna.metabolism, 0.6, 1.6)) * 0.22;
        const width = 0.62 + energy * 0.10;
        setInstance(group.body, index, localX, ground + 0.95, localZ, yaw, length, bodyH, width, hue, 0.66, 0.48 + Math.min(0.12, energy * 0.04));
        const headScale = 0.43 + clamp(dna.sense, 0.6, 1.4) * 0.18;
        setInstance(group.detail, index, localX + fx * length * 0.78, ground + 1.18, localZ + fz * length * 0.78, yaw, headScale, headScale, headScale, hue + 12, 0.72, 0.58);
      } else if (type === 'predator') {
        const length = 0.88 + dna.speed * 0.34;
        const width = 0.72 + clamp(dna.sense, 0.35, 2.1) * 0.18;
        setInstance(group.body, index, localX, ground + 1.15, localZ, yaw, length, width, width, hue, 0.82, 0.48);
        setInstance(group.detail, index, localX + fx * 1.05, ground + 1.62, localZ + fz * 1.05, yaw, 0.42 + dna.sense * 0.10, 0.40, 0.38, hue + 24, 0.90, 0.58);
      } else {
        const scale = 1.15 + energy * 0.18;
        setInstance(group.body, index, localX, ground + 1.55, localZ, yaw, scale * 1.35, scale, scale * 1.15, hue, 0.62, 0.52);
        setInstance(group.detail, index, localX + fx * 1.15, ground + 2.25, localZ + fz * 1.15, yaw, 0.65 + dna.sense * 0.12, 0.52, 0.52, hue + 38, 0.78, 0.66);
      }
      index++;
    }
    group.body.count = index;
    group.detail.count = index;
    group.body.instanceMatrix.needsUpdate = true;
    group.detail.instanceMatrix.needsUpdate = true;
    if (group.body.instanceColor) group.body.instanceColor.needsUpdate = true;
    if (group.detail.instanceColor) group.detail.instanceColor.needsUpdate = true;
    return index;
  }

  function updateRendering(now) {
    const a = anchor();
    if (!a) return;
    const extrapolation = clamp((now - lastSimAt) / 1000, 0, SIM_INTERVAL);
    stats.renderedAgents = renderCategory('agent', agent, a, extrapolation);
    stats.renderedPredators = renderCategory('predator', predator, a, extrapolation);
    stats.renderedApex = renderCategory('apex', apex, a, extrapolation);
    stats.renderUpdates++;
    document.documentElement.dataset.surfaceModeVisibleCreatures = String(stats.renderedAgents + stats.renderedPredators + stats.renderedApex);
  }

  function setVisibility(visible) {
    for (const group of Object.values(groups)) {
      if (group.body) group.body.visible = visible;
      if (group.detail) group.detail.visible = visible;
    }
  }

  function loop(now) {
    requestAnimationFrame(loop);
    const dt = clamp((now - lastNow) / 1000, 0, 0.05);
    lastNow = now;
    const active = surfaceActive();
    if (!active) {
      if (activeLast) {
        activeLast = false;
        accumulator = 0;
        setVisibility(false);
      }
      return;
    }
    if (!activeLast) {
      activeLast = true;
      setVisibility(true);
      ensureTerrainSamples();
      lastSimAt = now;
    }

    accumulator += dt;
    let steps = 0;
    while (accumulator >= SIM_INTERVAL && steps < 2) {
      simulate(SIM_INTERVAL);
      accumulator -= SIM_INTERVAL;
      steps++;
    }
    if (now - lastRenderUpdate >= RENDER_INTERVAL_MS) {
      lastRenderUpdate = now;
      updateRendering(now);
    }
  }
  requestAnimationFrame(loop);

  const api = {
    installed: true,
    getStats: () => ({
      ...stats,
      active: surfaceActive(),
      population: agent.size + predator.size + apex.size,
      agents: agent.size,
      predators: predator.size,
      apex: apex.size,
      resources: resource.size,
      spatialHash: true,
      spatialCellSize: CELL_SIZE,
      quadraticNeighborScans: false,
      simulationHz: 1 / SIM_INTERVAL,
      nearDecisionHz: 1 / SIM_INTERVAL,
      midDecisionHz: 1 / (SIM_INTERVAL * 2),
      farDecisionHz: 1 / (SIM_INTERVAL * 5),
      distanceAwareSimulation: true,
      gpuInstancing: true,
      dynamicInstanceCapacity: true,
      lowPolyMorphology: true,
      dnaDrivenMorphology: true,
      globalPopulationCap: false,
      globalDisplayCap: false,
      terrainSamplingInRenderLoop: false,
      terrainCacheSize: terrainCache.size,
      terrainCacheLimit: TERRAIN_CACHE_LIMIT,
      rendererUpdatesHz: 30,
      shadowsEnabled: false,
      cameraAltitude: camera?.position?.y ?? null,
    }),
  };

  window.realitySandboxSurfaceCreaturesV44 = api;
  document.documentElement.dataset.surfaceCreaturesV44 = 'spatial-hash-gpu-instanced-living-ecology';

  const prev = window.realitySandboxPresentationDiagnostics;
  window.realitySandboxPresentationDiagnostics = () => ({
    ...(typeof prev === 'function' ? prev() : {}),
    surfaceCreaturesV44: api.getStats(),
  });
}

waitForRuntime().then(state => {
  if (!state) {
    document.documentElement.dataset.surfaceCreaturesV44 = 'unavailable';
    return;
  }
  install(state);
});
