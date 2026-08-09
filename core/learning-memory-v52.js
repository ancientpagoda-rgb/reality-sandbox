const STEP_SECONDS = 0.9;
const EPSILON = 0.025;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number(v) || 0));
const wrap = (v, max) => ((v % max) + max) % max;

async function waitForRuntime() {
  while (true) {
    const brain = window.realitySandboxSensoryBrainsV50;
    const social = window.realitySandboxSocialSignalingV51;
    const origin = window.realitySandboxOriginMotileLifeV47;
    const planet = window.realitySandboxPlanet;
    const modules = window.realitySandboxModules;
    const c = planet?.world?.ecs?.components;
    if (brain?.installed && social?.installed && origin?.installed && modules?.step && c?.motile instanceof Map && c?.position instanceof Map && c?.velocity instanceof Map) {
      return { brain, social, origin, planet, modules };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ brain, social, origin, planet, modules }) {
  if (window.realitySandboxLearningMemoryV52?.installed) return;
  const { world } = planet;
  const { motile, position, velocity } = world.ecs.components;
  let accumulator = 0;
  let stepCount = 0;

  const stats = {
    steps: 0,
    memoriesFormed: 0,
    memoriesReinforced: 0,
    memoriesExtinguished: 0,
    foodRecalls: 0,
    dangerRecalls: 0,
    huntRecalls: 0,
    socialMemories: 0,
    activeMemories: 0,
    recallingOrganisms: 0,
    meanLearningRate: 0,
    meanRetention: 0,
  };

  function dxTo(targetX, originX) {
    let d = targetX - originX;
    if (d > world.width * 0.5) d -= world.width;
    else if (d < -world.width * 0.5) d += world.width;
    return d;
  }

  function phenotype(g = {}) {
    const brainSpeed = clamp(g.brainSpeed);
    const sense = clamp(g.sense);
    const sociality = clamp(g.sociality);
    const dormancy = clamp(g.dormancy);
    const metabolism = clamp(g.metabolism);
    const motility = clamp(g.motility);
    return {
      learningRate: clamp(0.10 + brainSpeed * 0.52 + sense * 0.24 + sociality * 0.08),
      retention: clamp(0.30 + brainSpeed * 0.42 + dormancy * 0.16 + sense * 0.08 - metabolism * 0.08, 0.18, 0.94),
      recallThreshold: 0.16 + (1 - brainSpeed) * 0.10,
      locomotorSpeed: 7 + motility * 36,
    };
  }

  function pointFor(id) {
    if (id == null) return null;
    const p = position.get(id);
    return p ? { x: wrap(p.x, world.width), y: Math.max(0, Math.min(world.height, p.y)), targetId: id } : null;
  }

  function ensureState(organism, ph) {
    if (!organism.bioV52) {
      organism.bioV52 = {
        learningRate: ph.learningRate,
        retention: ph.retention,
        memories: { food: null, danger: null, hunt: null },
        recalledAction: null,
        recalledMemory: null,
        lastEnergy: Number(organism.energy) || 0,
        formedAtStep: stepCount,
        lastSocialReceivedAtStep: null,
      };
    }
    organism.bioV52.learningRate = ph.learningRate;
    organism.bioV52.retention = ph.retention;
    return organism.bioV52;
  }

  function remember(state, type, point, strength, source) {
    if (!point || !state.memories || !Object.prototype.hasOwnProperty.call(state.memories, type)) return;
    const learning = state.learningRate;
    const incoming = clamp(strength) * (0.42 + learning * 0.58);
    const previous = state.memories[type];
    if (previous) {
      const blend = clamp(0.18 + learning * 0.52, 0.18, 0.70);
      previous.x = wrap(previous.x * (1 - blend) + point.x * blend, world.width);
      previous.y = previous.y * (1 - blend) + point.y * blend;
      previous.strength = clamp(previous.strength * (0.68 + state.retention * 0.18) + incoming * 0.55);
      previous.targetId = point.targetId ?? previous.targetId ?? null;
      previous.source = source;
      previous.updatedAtStep = stepCount;
      stats.memoriesReinforced++;
    } else {
      state.memories[type] = {
        x: point.x,
        y: point.y,
        strength: clamp(0.18 + incoming * 0.74),
        targetId: point.targetId ?? null,
        source,
        updatedAtStep: stepCount,
      };
      stats.memoriesFormed++;
    }
    if (source === 'social') stats.socialMemories++;
  }

  function decay(state) {
    for (const type of ['food', 'danger', 'hunt']) {
      const memory = state.memories[type];
      if (!memory) continue;
      const decayRate = 0.028 + (1 - state.retention) * 0.092;
      memory.strength *= Math.exp(-decayRate * STEP_SECONDS);
      if (memory.strength < EPSILON) {
        state.memories[type] = null;
        stats.memoriesExtinguished++;
      }
    }
  }

  function learnFromCurrentCues(organism, state) {
    const behavior = organism.bioV50 || {};
    if (behavior.targetPlant != null) remember(state, 'food', pointFor(behavior.targetPlant), 0.82, 'direct');
    if (behavior.targetDetritus != null) remember(state, 'food', pointFor(behavior.targetDetritus), 0.72, 'direct');
    if (behavior.detectedDanger != null) remember(state, 'danger', pointFor(behavior.detectedDanger), 0.94, 'direct');
    if (behavior.detectedPrey != null && behavior.mode === 'hunt') remember(state, 'hunt', pointFor(behavior.detectedPrey), 0.78, 'direct');

    const signal = organism.bioV51;
    if (signal?.targetId != null && signal.receivedAtStep !== state.lastSocialReceivedAtStep) {
      const type = signal.signalType === 'alarm' ? 'danger' : signal.signalType === 'hunt' ? 'hunt' : 'food';
      remember(state, type, pointFor(signal.targetId), clamp(signal.strength) * clamp(signal.receptivity), 'social');
      state.lastSocialReceivedAtStep = signal.receivedAtStep;
    }

    const energy = Number(organism.energy) || 0;
    const gain = energy - (Number(state.lastEnergy) || 0);
    if (gain > 0.035 && state.memories.food) {
      state.memories.food.strength = clamp(state.memories.food.strength + gain * state.learningRate * 0.35);
      state.memories.food.updatedAtStep = stepCount;
      stats.memoriesReinforced++;
    }
    state.lastEnergy = energy;
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

  function recall(organism, state, p, vel, ph) {
    state.recalledAction = null;
    state.recalledMemory = null;
    if (organism.state === 'sleeping') return false;

    const behavior = organism.bioV50 || {};
    const directFood = behavior.targetPlant != null || behavior.targetDetritus != null;
    const directDanger = behavior.detectedDanger != null;
    const directPrey = behavior.detectedPrey != null;
    const hunger = clamp(behavior.hunger);

    const danger = state.memories.danger;
    if (!directDanger && danger && danger.strength >= ph.recallThreshold && (behavior.mode === 'explore' || behavior.mode === 'rest' || hunger < 0.85)) {
      steerAway(vel, p, danger, ph.locomotorSpeed * 0.90, 0.77);
      state.recalledAction = 'avoid-danger';
      state.recalledMemory = { type: 'danger', ...danger };
      stats.dangerRecalls++;
      return true;
    }

    const food = state.memories.food;
    if (!directFood && food && food.strength >= ph.recallThreshold && hunger > 0.18 && (behavior.mode === 'explore' || behavior.mode === 'rest')) {
      steer(vel, p, food, ph.locomotorSpeed * 0.76, 0.81);
      state.recalledAction = 'seek-food';
      state.recalledMemory = { type: 'food', ...food };
      stats.foodRecalls++;
      return true;
    }

    const hunt = state.memories.hunt;
    if (!directPrey && hunt && hunt.strength >= ph.recallThreshold && clamp(organism.genome?.aggression) > 0.38 && hunger > 0.30 && behavior.mode === 'explore') {
      steer(vel, p, hunt, ph.locomotorSpeed * 0.92, 0.76);
      state.recalledAction = 'seek-prey';
      state.recalledMemory = { type: 'hunt', ...hunt };
      stats.huntRecalls++;
      return true;
    }
    return false;
  }

  function memoryStep() {
    let learningSum = 0;
    let retentionSum = 0;
    let organisms = 0;
    let active = 0;
    let recalling = 0;

    for (const [id, organism] of motile.entries()) {
      const p = position.get(id);
      const vel = velocity.get(id);
      if (!p || !vel) continue;
      const ph = phenotype(organism.genome);
      const state = ensureState(organism, ph);
      decay(state);
      learnFromCurrentCues(organism, state);
      if (recall(organism, state, p, vel, ph)) recalling++;
      for (const memory of Object.values(state.memories)) if (memory) active++;
      learningSum += ph.learningRate;
      retentionSum += ph.retention;
      organisms++;
    }

    stepCount++;
    stats.steps = stepCount;
    stats.activeMemories = active;
    stats.recallingOrganisms = recalling;
    stats.meanLearningRate = organisms ? learningSum / organisms : 0;
    stats.meanRetention = organisms ? retentionSum / organisms : 0;
  }

  const previousStep = modules.step.bind(modules);
  modules.step = function v52LearningMemoryStep(dt) {
    const result = previousStep(dt);
    accumulator += Number(dt) || 0;
    if (accumulator >= STEP_SECONDS) {
      accumulator = 0;
      memoryStep();
    }
    return result;
  };

  const api = {
    installed: true,
    getStats: () => ({
      ...stats,
      installed: true,
      inheritedLearningRate: true,
      inheritedMemoryRetention: true,
      directExperienceLearning: true,
      sociallyTransferredMemory: true,
      rewardReinforcement: true,
      memoryDecay: true,
      constantMemoryPerOrganism: true,
      populationComplexity: 'O(N)',
      authoritativeFixedStep: true,
      noHardPopulationCap: true,
      noHardDisplayCap: true,
      surfaceRendererEnabled: false,
    }),
    getMemory(id) {
      const state = motile.get(id)?.bioV52;
      if (!state) return null;
      return {
        learningRate: state.learningRate,
        retention: state.retention,
        recalledAction: state.recalledAction,
        recalledMemory: state.recalledMemory ? { ...state.recalledMemory } : null,
        memories: Object.fromEntries(Object.entries(state.memories).map(([key, value]) => [key, value ? { ...value } : null])),
      };
    },
    getPopulationMemories() {
      return [...motile.entries()].map(([id, organism]) => ({ id, lineageId: organism.lineageId, memory: api.getMemory(id) })).filter(item => item.memory);
    },
  };

  window.realitySandboxLearningMemoryV52 = api;
  window.realitySandboxEvolutionBuild = 'evolution-v52-learning-memory';
  document.documentElement.dataset.evolutionBuild = 'evolution-v52-learning-memory';
  document.documentElement.dataset.learningMemoryV52 = 'experience-recall-reinforcement';
}

waitForRuntime().then(install);
