const LOCAL_RADIUS = 300;
const SPAWN_MIN_RADIUS = 75;
const SPAWN_MAX_RADIUS = 260;
const TARGETS = Object.freeze({ agent: 20, predator: 4, apex: 1 });
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

async function waitForRuntime() {
  for (let i = 0; i < 420; i++) {
    const planet = window.realitySandboxPlanet;
    const mode = window.realitySandboxSurfaceMode;
    const creatures = window.realitySandboxSurfaceCreaturesV44;
    if (planet?.world?.ecs?.components && planet?.living?.sampleDynamicPlanet && mode?.getPlayer && creatures?.installed) {
      return { planet, mode, creatures };
    }
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  return null;
}

function install({ planet, mode }) {
  if (window.realitySandboxSurfaceLocalFaunaV44d?.installed) return;
  const { world, living } = planet;
  const { ecs } = world;
  const { position, velocity, agent, predator, apex } = ecs.components;
  const seed = window.realitySandboxSeed?.numericSeed || 734221;

  const stats = {
    seeded: false,
    seedAttempts: 0,
    terrainSamples: 0,
    landRejects: 0,
    spawnedAgents: 0,
    spawnedPredators: 0,
    spawnedApex: 0,
    nearbyBefore: 0,
    nearbyAfter: 0,
  };

  function nearbyCount(map, player) {
    let count = 0;
    const r2 = LOCAL_RADIUS * LOCAL_RADIUS;
    for (const [id] of map.entries()) {
      const pos = position.get(id);
      if (!pos) continue;
      const dx = wrappedDelta(pos.x, player.x, world.width);
      const dy = wrappedDelta(pos.y, player.y, world.height);
      if (dx * dx + dy * dy <= r2) count++;
    }
    return count;
  }

  function candidate(player, serial) {
    for (let attempt = 0; attempt < 5; attempt++) {
      stats.seedAttempts++;
      const a = hash01(seed + serial * 92821 + attempt * 37) * Math.PI * 2;
      const r = SPAWN_MIN_RADIUS + hash01(seed + serial * 131071 + attempt * 101) * (SPAWN_MAX_RADIUS - SPAWN_MIN_RADIUS);
      const x = wrap(player.x + Math.cos(a) * r, world.width);
      const y = wrap(player.y + Math.sin(a) * r, world.height);
      const terrain = living.sampleDynamicPlanet(x, y, 'surface-local-fauna-v44d');
      stats.terrainSamples++;
      if (terrain?.land !== false) return { x, y, serial };
      stats.landRejects++;
    }
    const a = hash01(seed + serial * 31337) * Math.PI * 2;
    const r = SPAWN_MIN_RADIUS + hash01(seed + serial * 65537) * (SPAWN_MAX_RADIUS - SPAWN_MIN_RADIUS);
    return {
      x: wrap(player.x + Math.cos(a) * r, world.width),
      y: wrap(player.y + Math.sin(a) * r, world.height),
      serial,
    };
  }

  function spawnAgent(player, serial) {
    const p = candidate(player, serial);
    const id = ecs.createEntity();
    const angle = hash01(seed + serial * 17) * Math.PI * 2;
    const speedTrait = 0.8 + hash01(seed + serial * 19) * 0.4;
    const sense = 0.8 + hash01(seed + serial * 23) * 0.4;
    const metabolism = 0.8 + hash01(seed + serial * 29) * 0.4;
    const hueShift = Math.round((hash01(seed + serial * 31) - 0.5) * 80);
    position.set(id, { x: p.x, y: p.y });
    velocity.set(id, { vx: Math.cos(angle) * 40 * speedTrait, vy: Math.sin(angle) * 40 * speedTrait });
    const dna = { speed: speedTrait, sense, metabolism, hueShift };
    let caste = 'balanced';
    if (sense > speedTrait && sense > 1.1) caste = 'scout';
    else if (speedTrait > sense && speedTrait > 1.1) caste = 'runner';
    else if (metabolism < 0.9) caste = 'saver';
    agent.set(id, {
      colorHue: 200 + hueShift,
      energy: 1.0 + hash01(seed + serial * 41) * 0.35,
      age: hash01(seed + serial * 43) * 4,
      dna,
      evolved: speedTrait + sense + (2 - metabolism) > 3.5,
      caste,
    });
    stats.spawnedAgents++;
  }

  function spawnPredator(player, serial) {
    const p = candidate(player, serial);
    const id = ecs.createEntity();
    const angle = hash01(seed + serial * 47) * Math.PI * 2;
    const speedTrait = 0.7 + hash01(seed + serial * 53) * 0.65;
    const sense = 0.75 + hash01(seed + serial * 59) * 0.65;
    const metabolism = 0.7 + hash01(seed + serial * 61) * 0.75;
    const hueShift = Math.round((hash01(seed + serial * 67) - 0.5) * 70);
    position.set(id, { x: p.x, y: p.y });
    velocity.set(id, { vx: Math.cos(angle) * 55 * speedTrait, vy: Math.sin(angle) * 55 * speedTrait });
    predator.set(id, {
      colorHue: 15 + hueShift,
      energy: 2.0 + hash01(seed + serial * 71) * 0.55,
      age: hash01(seed + serial * 73) * 5,
      rest: 0,
      dna: { speed: speedTrait, sense, metabolism, hueShift },
    });
    stats.spawnedPredators++;
  }

  function spawnApex(player, serial) {
    const p = candidate(player, serial);
    const id = ecs.createEntity();
    const angle = hash01(seed + serial * 79) * Math.PI * 2;
    const speedTrait = 0.85 + hash01(seed + serial * 83) * 0.28;
    const sense = 1.1 + hash01(seed + serial * 89) * 0.35;
    const metabolism = 0.8 + hash01(seed + serial * 97) * 0.28;
    const hueShift = Math.round((hash01(seed + serial * 101) - 0.5) * 28);
    position.set(id, { x: p.x, y: p.y });
    velocity.set(id, { vx: Math.cos(angle) * 35 * speedTrait, vy: Math.sin(angle) * 35 * speedTrait });
    apex.set(id, {
      colorHue: 205 + hueShift,
      energy: 3.0 + hash01(seed + serial * 103) * 0.65,
      age: hash01(seed + serial * 107) * 6,
      rest: 0,
      dna: { speed: speedTrait, sense, metabolism, hueShift },
    });
    stats.spawnedApex++;
  }

  function seedOnce() {
    if (world.__surfaceLocalFaunaSeededV44d) return;
    if (!mode.isActive?.() || document.documentElement.dataset.surfaceMode !== 'active') return;
    world.__surfaceLocalFaunaSeededV44d = true;
    const player = mode.getPlayer();
    const beforeAgent = nearbyCount(agent, player);
    const beforePred = nearbyCount(predator, player);
    const beforeApex = nearbyCount(apex, player);
    stats.nearbyBefore = beforeAgent + beforePred + beforeApex;

    let serial = 1;
    for (let i = beforeAgent; i < TARGETS.agent; i++) spawnAgent(player, serial++);
    for (let i = beforePred; i < TARGETS.predator; i++) spawnPredator(player, 1000 + serial++);
    for (let i = beforeApex; i < TARGETS.apex; i++) spawnApex(player, 2000 + serial++);

    stats.nearbyAfter = nearbyCount(agent, player) + nearbyCount(predator, player) + nearbyCount(apex, player);
    stats.seeded = true;
    document.documentElement.dataset.surfaceLocalFaunaV44d = 'seeded';
  }

  function loop() {
    requestAnimationFrame(loop);
    if (!stats.seeded) seedOnce();
  }
  requestAnimationFrame(loop);

  const api = {
    installed: true,
    getStats: () => ({
      ...stats,
      targetAgentsNearby: TARGETS.agent,
      targetPredatorsNearby: TARGETS.predator,
      targetApexNearby: TARGETS.apex,
      localRadius: LOCAL_RADIUS,
      oneTimePerWorld: true,
      realEcsCreatures: true,
      recurringTopUp: false,
      globalPopulationCap: false,
      globalDisplayCap: false,
      renderLoopProceduralSamples: 0,
    }),
  };

  window.realitySandboxSurfaceLocalFaunaV44d = api;
  document.documentElement.dataset.surfaceLocalFaunaV44d = 'installed';
  const prev = window.realitySandboxPresentationDiagnostics;
  window.realitySandboxPresentationDiagnostics = () => ({
    ...(typeof prev === 'function' ? prev() : {}),
    surfaceLocalFaunaV44d: api.getStats(),
  });
}

waitForRuntime().then(state => {
  if (!state) {
    document.documentElement.dataset.surfaceLocalFaunaV44d = 'unavailable';
    return;
  }
  install(state);
});
