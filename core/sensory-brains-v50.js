const STEP_SECONDS = 0.9;
const CELL_SIZE = 96;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number(v) || 0));
const wrap = (v, max) => ((v % max) + max) % max;

async function waitForRuntime() {
  while (true) {
    const origin = window.realitySandboxOriginMotileLifeV47;
    const nutrient = window.realitySandboxClosedNutrientCycleV49;
    const planet = window.realitySandboxPlanet;
    const modules = window.realitySandboxModules;
    const c = planet?.world?.ecs?.components;
    if (origin?.installed && nutrient?.installed && modules?.step && c?.motile instanceof Map && c?.position instanceof Map && c?.velocity instanceof Map) {
      return { origin, nutrient, planet, modules };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ origin, nutrient, planet, modules }) {
  if (window.realitySandboxSensoryBrainsV50?.installed) return;
  const { world } = planet;
  const { motile, position, velocity, resource, detritus } = world.ecs.components;
  const cols = Math.max(1, Math.ceil(world.width / CELL_SIZE));
  const rows = Math.max(1, Math.ceil(world.height / CELL_SIZE));
  let accumulator = 0;
  let steps = 0;

  const stats = {
    steps: 0,
    decisions: 0,
    graze: 0,
    scavenge: 0,
    hunt: 0,
    flee: 0,
    flock: 0,
    rest: 0,
    explore: 0,
    nutrientSeeking: 0,
    dangerDetections: 0,
    kinDetections: 0,
    preyDetections: 0,
    meanReactionSpeed: 0,
    meanSenseRadius: 0,
  };

  function keyFor(x, y) {
    const cx = Math.floor(wrap(x, world.width) / CELL_SIZE) % cols;
    const cy = Math.max(0, Math.min(rows - 1, Math.floor(Math.max(0, Math.min(world.height - 0.0001, y)) / CELL_SIZE)));
    return `${cx}:${cy}`;
  }

  function neighborKeys(x, y, rings = 1) {
    const cx = Math.floor(wrap(x, world.width) / CELL_SIZE) % cols;
    const cy = Math.max(0, Math.min(rows - 1, Math.floor(Math.max(0, Math.min(world.height - 0.0001, y)) / CELL_SIZE)));
    const out = [];
    for (let oy = -rings; oy <= rings; oy++) {
      for (let ox = -rings; ox <= rings; ox++) {
        const nx = (cx + ox + cols) % cols;
        const ny = Math.max(0, Math.min(rows - 1, cy + oy));
        out.push(`${nx}:${ny}`);
      }
    }
    return out;
  }

  function dxTo(targetX, originX) {
    let d = targetX - originX;
    if (d > world.width * 0.5) d -= world.width;
    else if (d < -world.width * 0.5) d += world.width;
    return d;
  }

  function distance(a, b) {
    return Math.hypot(dxTo(b.x, a.x), b.y - a.y);
  }

  function buildGrid(component) {
    const grid = new Map();
    for (const [id] of component.entries()) {
      const p = position.get(id);
      if (!p) continue;
      const key = keyFor(p.x, p.y);
      let bucket = grid.get(key);
      if (!bucket) grid.set(key, bucket = []);
      bucket.push(id);
    }
    return grid;
  }

  function nearestFromGrid(p, grid, component, radius, predicate = null) {
    const rings = Math.max(1, Math.min(3, Math.ceil(radius / CELL_SIZE)));
    let best = null;
    let bestD = radius;
    for (const key of neighborKeys(p.x, p.y, rings)) {
      for (const id of grid.get(key) || []) {
        const value = component.get(id);
        const q = position.get(id);
        if (!value || !q || (predicate && !predicate(id, value))) continue;
        const d = distance(p, q);
        if (d < bestD) { bestD = d; best = { id, value, p: q, d }; }
      }
    }
    return best;
  }

  function steer(vel, p, target, speed, blend = 0.82) {
    const dx = dxTo(target.x, p.x);
    const dy = target.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    vel.vx = vel.vx * blend + (dx / d) * speed * (1 - blend);
    vel.vy = vel.vy * blend + (dy / d) * speed * (1 - blend);
  }

  function flee(vel, p, target, speed, blend = 0.72) {
    const dx = dxTo(target.x, p.x);
    const dy = target.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    vel.vx = vel.vx * blend - (dx / d) * speed * (1 - blend);
    vel.vy = vel.vy * blend - (dy / d) * speed * (1 - blend);
  }

  function phenotype(g = {}) {
    const brain = clamp(g.brainSpeed);
    const sense = clamp(g.sense);
    const hetero = clamp(g.heterotrophy);
    const photo = clamp(g.photosynthesis);
    const social = clamp(g.sociality);
    const aggression = clamp(g.aggression);
    const scavenge = clamp(g.scavenging);
    const motility = clamp(g.motility);
    const dormancy = clamp(g.dormancy);
    const armor = clamp(g.armor);
    const body = clamp(g.bodySize);
    return {
      reactionSpeed: 0.18 + brain * 0.82,
      senseRadius: 34 + sense * 190,
      hungerWeight: 0.35 + hetero * 0.75,
      lightRestWeight: 0.18 + photo * 0.62 + dormancy * 0.18,
      kinWeight: social * (0.45 + brain * 0.35),
      fearWeight: clamp((1 - aggression) * (0.40 + sense * 0.45) * (1 - armor * 0.35)),
      huntWeight: aggression * hetero * (0.55 + brain * 0.30),
      scavengeWeight: scavenge * hetero * (0.58 + sense * 0.25),
      exploreWeight: motility * (0.25 + brain * 0.45),
      locomotorSpeed: 7 + motility * 36,
      body,
      aggression,
      social,
      photo,
      hetero,
    };
  }

  function decide(id, organism, p, vel, motileGrid, resourceGrid, detritusGrid) {
    if (organism.state === 'sleeping') {
      organism.bioV50 = { mode: 'rest', drives: { rest: 1 }, reactionSpeed: 0, senseRadius: 0 };
      stats.rest++;
      stats.decisions++;
      return;
    }

    const ph = phenotype(organism.genome);
    const energy = clamp((Number(organism.energy) || 0) / 2.7);
    const hunger = 1 - energy;
    const sleepDebt = clamp((Number(organism.sleepDebt) || 0) / 1.4);
    const senseRadius = ph.senseRadius;

    const plant = nearestFromGrid(p, resourceGrid, resource, senseRadius, (_id, res) => (res.amount || 0) > 0.04);
    const corpse = nearestFromGrid(p, detritusGrid, detritus, senseRadius, (_id, det) => (det.amount || 0) > 0.03);
    const other = nearestFromGrid(p, motileGrid, motile, senseRadius, otherId => otherId !== id);
    const prey = nearestFromGrid(p, motileGrid, motile, senseRadius, (otherId, otherOrg) => {
      if (otherId === id || otherOrg.lineageId === organism.lineageId) return false;
      const otherBody = clamp(otherOrg.genome?.bodySize);
      return otherBody <= ph.body * 1.28 + 0.12;
    });
    const kin = nearestFromGrid(p, motileGrid, motile, senseRadius, (otherId, otherOrg) => otherId !== id && otherOrg.lineageId === organism.lineageId);

    let danger = null;
    if (other) {
      const enemy = other.value;
      const eg = phenotype(enemy.genome);
      const threat = eg.aggression * (0.45 + eg.body * 0.75) - ph.aggression * (0.30 + ph.body * 0.35);
      if (enemy.lineageId !== organism.lineageId && threat > 0.20) {
        danger = other;
        stats.dangerDetections++;
      }
    }
    if (kin) stats.kinDetections++;
    if (prey) stats.preyDetections++;

    const localSoil = nutrient.sample?.(p.x, p.y) || { nutrient: 0.5, toxin: 0 };
    const nutrientScarcity = clamp(1 - (Number(localSoil.nutrient) || 0) / 1.2);
    const drives = {
      flee: danger ? ph.fearWeight * (0.45 + hunger * 0.15 + clamp(danger.d / senseRadius, 0, 1) * -0.22 + 0.55) : 0,
      hunt: prey ? ph.huntWeight * (0.35 + hunger * 0.85) : 0,
      scavenge: corpse ? ph.scavengeWeight * (0.28 + hunger * 0.92) : 0,
      graze: plant ? ph.hungerWeight * ph.hetero * (0.22 + hunger * 0.92) : 0,
      flock: kin ? ph.kinWeight * (0.36 + (1 - hunger) * 0.22) : 0,
      rest: ph.lightRestWeight * (0.25 + sleepDebt * 0.70 + ph.photo * (1 - hunger) * 0.20),
      explore: ph.exploreWeight * (0.26 + nutrientScarcity * 0.26 + (plant || corpse || prey ? 0 : 0.42)),
    };

    let mode = 'explore';
    let best = -Infinity;
    for (const [name, value] of Object.entries(drives)) {
      if (value > best) { best = value; mode = name; }
    }

    const speed = ph.locomotorSpeed * (0.72 + ph.reactionSpeed * 0.45);
    if (mode === 'flee' && danger) flee(vel, p, danger.p, speed * 1.12, 0.62 + (1 - ph.reactionSpeed) * 0.16);
    else if (mode === 'hunt' && prey) steer(vel, p, prey.p, speed * 1.08, 0.64 + (1 - ph.reactionSpeed) * 0.16);
    else if (mode === 'scavenge' && corpse) steer(vel, p, corpse.p, speed * 0.92, 0.70);
    else if (mode === 'graze' && plant) steer(vel, p, plant.p, speed * 0.78, 0.74);
    else if (mode === 'flock' && kin) steer(vel, p, kin.p, speed * 0.62, 0.84);
    else if (mode === 'rest') { vel.vx *= 0.84; vel.vy *= 0.84; }
    else {
      const phase = (id * 0.61803398875 + steps * (0.07 + ph.reactionSpeed * 0.11)) * Math.PI * 2;
      vel.vx = vel.vx * 0.90 + Math.cos(phase) * speed * 0.10;
      vel.vy = vel.vy * 0.90 + Math.sin(phase) * speed * 0.10;
      if (nutrientScarcity > 0.6) stats.nutrientSeeking++;
    }

    organism.bioV50 = {
      mode,
      drives,
      reactionSpeed: ph.reactionSpeed,
      senseRadius,
      hunger,
      nutrientScarcity,
      detectedDanger: danger?.id || null,
      detectedPrey: prey?.id || null,
      detectedKin: kin?.id || null,
      targetPlant: plant?.id || null,
      targetDetritus: corpse?.id || null,
    };
    stats[mode]++;
    stats.decisions++;
  }

  function brainStep() {
    const motileGrid = buildGrid(motile);
    const resourceGrid = buildGrid(resource);
    const detritusGrid = buildGrid(detritus);
    let reaction = 0;
    let radius = 0;
    let n = 0;
    for (const [id, organism] of motile.entries()) {
      const p = position.get(id);
      const vel = velocity.get(id);
      if (!p || !vel) continue;
      decide(id, organism, p, vel, motileGrid, resourceGrid, detritusGrid);
      const state = organism.bioV50;
      reaction += Number(state?.reactionSpeed) || 0;
      radius += Number(state?.senseRadius) || 0;
      n++;
    }
    stats.meanReactionSpeed = n ? reaction / n : 0;
    stats.meanSenseRadius = n ? radius / n : 0;
    steps++;
    stats.steps = steps;
  }

  const previousStep = modules.step.bind(modules);
  modules.step = function v50SensoryBrainStep(dt) {
    const result = previousStep(dt);
    accumulator += Number(dt) || 0;
    if (accumulator >= STEP_SECONDS) {
      accumulator = 0;
      brainStep();
    }
    return result;
  };

  const api = {
    installed: true,
    getStats: () => ({
      ...stats,
      installed: true,
      heritableBehaviorFromGenome: true,
      competingBehavioralDrives: true,
      spatialHashing: true,
      behaviorModes: ['graze','scavenge','hunt','flee','flock','rest','explore'],
      noHardPopulationCap: true,
      noHardDisplayCap: true,
      authoritativeFixedStep: true,
      surfaceRendererEnabled: false,
    }),
    getBehavior(id) {
      const organism = motile.get(id);
      return organism?.bioV50 ? { ...organism.bioV50, drives: { ...organism.bioV50.drives } } : null;
    },
    getPopulationBehaviors() {
      return [...motile.entries()].map(([id, organism]) => ({ id, lineageId: organism.lineageId, ...(organism.bioV50 || {}) }));
    },
  };

  window.realitySandboxSensoryBrainsV50 = api;
  window.realitySandboxEvolutionBuild = 'evolution-v50-sensory-brains';
  document.documentElement.dataset.evolutionBuild = 'evolution-v50-sensory-brains';
  document.documentElement.dataset.sensoryBrainsV50 = 'heritable-drive-brains';
}

waitForRuntime().then(install);
