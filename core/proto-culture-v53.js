const STEP_SECONDS = 0.9;
const CELL_SIZE = 112;
const PRACTICES = ['food-route', 'danger-avoidance', 'pack-hunt'];
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number(v) || 0));
const wrap = (v, max) => ((v % max) + max) % max;

async function waitForRuntime() {
  while (true) {
    const memory = window.realitySandboxLearningMemoryV52;
    const social = window.realitySandboxSocialSignalingV51;
    const brain = window.realitySandboxSensoryBrainsV50;
    const origin = window.realitySandboxOriginMotileLifeV47;
    const planet = window.realitySandboxPlanet;
    const modules = window.realitySandboxModules;
    const c = planet?.world?.ecs?.components;
    if (memory?.installed && social?.installed && brain?.installed && origin?.installed && modules?.step && c?.motile instanceof Map && c?.position instanceof Map && c?.velocity instanceof Map) {
      return { memory, social, brain, origin, planet, modules };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ memory, social, brain, origin, planet, modules }) {
  if (window.realitySandboxProtoCultureV53?.installed) return;
  const { world } = planet;
  const { motile, position, velocity } = world.ecs.components;
  const cols = Math.max(1, Math.ceil(world.width / CELL_SIZE));
  const rows = Math.max(1, Math.ceil(world.height / CELL_SIZE));
  let accumulator = 0;
  let stepCount = 0;

  const stats = {
    steps: 0,
    demonstrations: 0,
    observations: 0,
    adoptions: 0,
    reinforcements: 0,
    forgottenPractices: 0,
    intergenerationalTransmissions: 0,
    culturalGuidanceEvents: 0,
    foodRouteGuidance: 0,
    dangerAvoidanceGuidance: 0,
    packHuntGuidance: 0,
    activeTraditions: 0,
    culturalLineages: 0,
    meanOpenness: 0,
    meanConformity: 0,
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
        out.push(`${(cx + ox + cols) % cols}:${Math.max(0, Math.min(rows - 1, cy + oy))}`);
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

  function phenotype(g = {}) {
    const brainSpeed = clamp(g.brainSpeed);
    const sense = clamp(g.sense);
    const sociality = clamp(g.sociality);
    const aggression = clamp(g.aggression);
    const motility = clamp(g.motility);
    return {
      openness: clamp(0.08 + brainSpeed * 0.45 + sense * 0.24 + sociality * 0.23),
      conformity: clamp(0.05 + sociality * 0.62 + brainSpeed * 0.18 + (1 - aggression) * 0.10),
      observationRadius: 36 + sense * 150 + sociality * 74,
      locomotorSpeed: 7 + motility * 36,
    };
  }

  function ensureState(organism, ph) {
    if (!organism.bioV53) {
      organism.bioV53 = {
        openness: ph.openness,
        conformity: ph.conformity,
        practices: { 'food-route': null, 'danger-avoidance': null, 'pack-hunt': null },
        appliedPractice: null,
        learnedFrom: null,
        lastEnergy: Number(organism.energy) || 0,
        culturalAge: 0,
      };
    }
    organism.bioV53.openness = ph.openness;
    organism.bioV53.conformity = ph.conformity;
    organism.bioV53.culturalAge++;
    return organism.bioV53;
  }

  function buildGrid() {
    const grid = new Map();
    for (const [id] of motile.entries()) {
      const p = position.get(id);
      if (!p) continue;
      const key = keyFor(p.x, p.y);
      let bucket = grid.get(key);
      if (!bucket) grid.set(key, bucket = []);
      bucket.push(id);
    }
    return grid;
  }

  function memoryTarget(organism, type) {
    const state = organism.bioV52;
    if (!state?.memories) return null;
    const memoryType = type === 'food-route' ? 'food' : type === 'danger-avoidance' ? 'danger' : 'hunt';
    const memory = state.memories[memoryType];
    if (!memory) return null;
    return { x: wrap(memory.x, world.width), y: Math.max(0, Math.min(world.height, memory.y)), targetId: memory.targetId ?? null };
  }

  function directTarget(organism, type) {
    const b = organism.bioV50 || {};
    const id = type === 'food-route'
      ? (b.targetPlant ?? b.targetDetritus)
      : type === 'danger-avoidance'
        ? b.detectedDanger
        : b.detectedPrey;
    if (id == null) return null;
    const p = position.get(id);
    return p ? { x: wrap(p.x, world.width), y: Math.max(0, Math.min(world.height, p.y)), targetId: id } : null;
  }

  function demonstratedPractice(organism, state) {
    const b = organism.bioV50 || {};
    const m = organism.bioV52 || {};
    const signal = organism.bioV51 || {};
    const energy = Number(organism.energy) || 0;
    const gain = energy - (Number(state.lastEnergy) || 0);
    state.lastEnergy = energy;

    const candidates = [];
    if (m.recalledAction === 'seek-food' || b.mode === 'graze' || b.mode === 'scavenge') {
      const target = memoryTarget(organism, 'food-route') || directTarget(organism, 'food-route');
      const evidence = clamp(0.36 + Math.max(0, gain) * 1.8 + (m.recalledAction === 'seek-food' ? 0.22 : 0));
      if (target) candidates.push({ type:'food-route', target, evidence });
    }
    if (m.recalledAction === 'avoid-danger' || b.mode === 'flee') {
      const target = memoryTarget(organism, 'danger-avoidance') || directTarget(organism, 'danger-avoidance');
      const evidence = clamp(0.50 + (m.recalledAction === 'avoid-danger' ? 0.20 : 0) + clamp(energy / 2.7) * 0.16);
      if (target) candidates.push({ type:'danger-avoidance', target, evidence });
    }
    if (m.recalledAction === 'seek-prey' || b.mode === 'hunt' || signal.signalType === 'hunt') {
      const target = memoryTarget(organism, 'pack-hunt') || directTarget(organism, 'pack-hunt');
      const evidence = clamp(0.34 + Math.max(0, gain) * 1.9 + (signal.signalType === 'hunt' ? 0.18 : 0));
      if (target) candidates.push({ type:'pack-hunt', target, evidence });
    }

    candidates.sort((a, b2) => b2.evidence - a.evidence);
    return candidates[0] || null;
  }

  function decayPractices(state) {
    for (const type of PRACTICES) {
      const practice = state.practices[type];
      if (!practice) continue;
      const persistence = clamp(0.30 + state.conformity * 0.42 + state.openness * 0.16);
      practice.strength *= Math.exp(-(0.020 + (1 - persistence) * 0.060) * STEP_SECONDS);
      if (practice.strength < 0.035) {
        state.practices[type] = null;
        stats.forgottenPractices++;
      }
    }
  }

  function internalize(organism, state, demonstration, sourceId, sourceGeneration, transmissionStrength) {
    const type = demonstration.type;
    const incoming = clamp(demonstration.evidence * transmissionStrength);
    if (incoming < 0.18) return false;
    const existing = state.practices[type];
    if (existing) {
      const blend = clamp(0.16 + state.openness * 0.44, 0.16, 0.64);
      existing.x = wrap(existing.x * (1 - blend) + demonstration.target.x * blend, world.width);
      existing.y = existing.y * (1 - blend) + demonstration.target.y * blend;
      existing.strength = clamp(existing.strength * (0.70 + state.conformity * 0.14) + incoming * 0.48);
      existing.modelId = sourceId;
      existing.updatedAtStep = stepCount;
      stats.reinforcements++;
    } else {
      state.practices[type] = {
        x: demonstration.target.x,
        y: demonstration.target.y,
        targetId: demonstration.target.targetId ?? null,
        strength: clamp(0.14 + incoming * 0.76),
        modelId: sourceId,
        learnedAtStep: stepCount,
        updatedAtStep: stepCount,
      };
      stats.adoptions++;
    }
    state.learnedFrom = sourceId;
    if ((organism.generation || 0) !== (sourceGeneration || 0)) stats.intergenerationalTransmissions++;
    return true;
  }

  function steer(vel, p, target, speed, blend) {
    const dx = dxTo(target.x, p.x);
    const dy = target.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    vel.vx = vel.vx * blend + (dx / d) * speed * (1 - blend);
    vel.vy = vel.vy * blend + (dy / d) * speed * (1 - blend);
  }

  function steerAway(vel, p, target, speed, blend) {
    const dx = dxTo(target.x, p.x);
    const dy = target.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    vel.vx = vel.vx * blend - (dx / d) * speed * (1 - blend);
    vel.vy = vel.vy * blend - (dy / d) * speed * (1 - blend);
  }

  function applyPractice(organism, state, p, vel, ph) {
    state.appliedPractice = null;
    if (organism.state === 'sleeping') return;
    const b = organism.bioV50 || {};
    const m = organism.bioV52 || {};
    const hunger = clamp(b.hunger);
    const directFood = b.targetPlant != null || b.targetDetritus != null;
    const directDanger = b.detectedDanger != null;
    const directPrey = b.detectedPrey != null;
    if (m.recalledAction) return;

    const danger = state.practices['danger-avoidance'];
    if (!directDanger && danger?.strength > 0.24 && (b.mode === 'explore' || b.mode === 'rest')) {
      steerAway(vel, p, danger, ph.locomotorSpeed * (0.70 + danger.strength * 0.22), 0.80);
      state.appliedPractice = 'danger-avoidance';
      stats.culturalGuidanceEvents++;
      stats.dangerAvoidanceGuidance++;
      return;
    }

    const food = state.practices['food-route'];
    if (!directFood && food?.strength > 0.24 && hunger > 0.18 && (b.mode === 'explore' || b.mode === 'rest')) {
      steer(vel, p, food, ph.locomotorSpeed * (0.62 + food.strength * 0.20), 0.82);
      state.appliedPractice = 'food-route';
      stats.culturalGuidanceEvents++;
      stats.foodRouteGuidance++;
      return;
    }

    const hunt = state.practices['pack-hunt'];
    if (!directPrey && hunt?.strength > 0.24 && hunger > 0.28 && clamp(organism.genome?.aggression) > 0.34 && b.mode === 'explore') {
      steer(vel, p, hunt, ph.locomotorSpeed * (0.74 + hunt.strength * 0.24), 0.78);
      state.appliedPractice = 'pack-hunt';
      stats.culturalGuidanceEvents++;
      stats.packHuntGuidance++;
    }
  }

  function cultureStep() {
    const grid = buildGrid();
    const demonstrations = [];
    let opennessSum = 0;
    let conformitySum = 0;
    let population = 0;

    for (const [id, organism] of motile.entries()) {
      const p = position.get(id);
      const vel = velocity.get(id);
      if (!p || !vel) continue;
      const ph = phenotype(organism.genome);
      const state = ensureState(organism, ph);
      decayPractices(state);
      const demo = demonstratedPractice(organism, state);
      if (demo && demo.evidence >= 0.32) {
        demonstrations.push({ id, lineageId:organism.lineageId, generation:organism.generation || 0, p:{ x:p.x, y:p.y }, ph, demo });
        stats.demonstrations++;
      }
      opennessSum += ph.openness;
      conformitySum += ph.conformity;
      population++;
    }

    for (const model of demonstrations) {
      const rings = Math.max(1, Math.min(3, Math.ceil(model.ph.observationRadius / CELL_SIZE)));
      for (const key of neighborKeys(model.p.x, model.p.y, rings)) {
        for (const observerId of grid.get(key) || []) {
          if (observerId === model.id) continue;
          const observer = motile.get(observerId);
          const op = position.get(observerId);
          if (!observer || !op || observer.lineageId !== model.lineageId) continue;
          const d = distance(model.p, op);
          const oph = phenotype(observer.genome);
          const radius = Math.min(model.ph.observationRadius, oph.observationRadius);
          if (d > radius) continue;
          stats.observations++;
          const observerState = ensureState(observer, oph);
          const distanceFactor = clamp(1 - d / Math.max(1, radius));
          const transmission = clamp(oph.openness * 0.48 + oph.conformity * 0.32 + model.demo.evidence * 0.20) * (0.48 + distanceFactor * 0.52);
          if (transmission * model.demo.evidence < 0.23) continue;
          internalize(observer, observerState, model.demo, model.id, model.generation, transmission);
        }
      }
    }

    const culturalLineages = new Set();
    let active = 0;
    for (const [id, organism] of motile.entries()) {
      const state = organism.bioV53;
      const p = position.get(id);
      const vel = velocity.get(id);
      if (!state || !p || !vel) continue;
      const ph = phenotype(organism.genome);
      applyPractice(organism, state, p, vel, ph);
      let hasCulture = false;
      for (const practice of Object.values(state.practices)) {
        if (!practice) continue;
        active++;
        hasCulture = true;
      }
      if (hasCulture) culturalLineages.add(organism.lineageId);
    }

    stepCount++;
    stats.steps = stepCount;
    stats.activeTraditions = active;
    stats.culturalLineages = culturalLineages.size;
    stats.meanOpenness = population ? opennessSum / population : 0;
    stats.meanConformity = population ? conformitySum / population : 0;
  }

  const previousStep = modules.step.bind(modules);
  modules.step = function v53ProtoCultureStep(dt) {
    const result = previousStep(dt);
    accumulator += Number(dt) || 0;
    if (accumulator >= STEP_SECONDS) {
      accumulator = 0;
      cultureStep();
    }
    return result;
  };

  const api = {
    installed: true,
    getStats: () => ({
      ...stats,
      installed: true,
      nonGeneticTransmission: true,
      physicallyLocalObservation: true,
      kinBiasedTransmission: true,
      culturallyBlankNewborns: true,
      learnedTraditionsAffectBehavior: true,
      intergenerationalSocialLearning: true,
      spatialHashing: true,
      practiceTypes: PRACTICES.slice(),
      authoritativeFixedStep: true,
      noHardPopulationCap: true,
      noHardDisplayCap: true,
      surfaceRendererEnabled: false,
    }),
    getCulture(id) {
      const state = motile.get(id)?.bioV53;
      if (!state) return null;
      return {
        openness: state.openness,
        conformity: state.conformity,
        appliedPractice: state.appliedPractice,
        learnedFrom: state.learnedFrom,
        practices: Object.fromEntries(Object.entries(state.practices).map(([key, value]) => [key, value ? { ...value } : null])),
      };
    },
    getPopulationCulture() {
      return [...motile.entries()].map(([id, organism]) => ({ id, lineageId:organism.lineageId, generation:organism.generation || 0, culture:api.getCulture(id) })).filter(item => item.culture);
    },
  };

  window.realitySandboxProtoCultureV53 = api;
  window.realitySandboxEvolutionBuild = 'evolution-v53-proto-culture';
  document.documentElement.dataset.evolutionBuild = 'evolution-v53-proto-culture';
  document.documentElement.dataset.protoCultureV53 = 'local-observation-social-learning';
}

waitForRuntime().then(install);
