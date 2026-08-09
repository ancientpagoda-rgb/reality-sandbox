const STEP_SECONDS = 0.45;
const PROTOTYPE_REFRESH_SECONDS = 10.8;
const CELL_SIZE = 92;

const SENSORS = ['energyLow','foodScarcity','preyOpportunity','threat','kinDensity','sleepDebt','soilToxin','habitatStress'];
const ACTIONS = ['forage','hunt','flee','flock','rest','explore'];

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number(v) || 0));
const clampSigned = v => Math.max(-1.5, Math.min(1.5, Number(v) || 0));
const wrap = (v, max) => ((v % max) + max) % max;

function hash32(text) {
  let h = 2166136261 >>> 0;
  const value = String(text);
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function hash01(text) { return hash32(text) / 4294967295; }
function wrappedDelta(value, origin, size) {
  let d = value - origin;
  if (d > size * 0.5) d -= size;
  else if (d < -size * 0.5) d += size;
  return d;
}
function distance(a, b, world) { return Math.hypot(wrappedDelta(a.x, b.x, world.width), wrappedDelta(a.y, b.y, world.height)); }
function makeWeights() { return Object.fromEntries(ACTIONS.map(action => [action, Object.fromEntries(SENSORS.map(sensor => [sensor, 0]))])); }

function copyBrain(brain) {
  const weights = makeWeights();
  for (const action of ACTIONS) for (const sensor of SENSORS) weights[action][sensor] = clampSigned(brain?.weights?.[action]?.[sensor]);
  return {
    bias: Object.fromEntries(ACTIONS.map(action => [action, clampSigned(brain?.bias?.[action])])),
    weights,
    memoryStrength: clamp(brain?.memoryStrength),
    decisionRate: clamp(brain?.decisionRate),
    inhibition: clamp(brain?.inhibition),
  };
}

function founderBrain(genome = {}, seed) {
  const weights = makeWeights();
  const r = key => hash01(`${seed}:${key}`);
  const jitter = key => (r(key) - 0.5) * 0.12;
  weights.forage.energyLow = 0.88 + jitter('forage-energy');
  weights.forage.foodScarcity = 0.72 + jitter('forage-food');
  weights.forage.soilToxin = -0.38 + jitter('forage-toxin');
  weights.forage.habitatStress = 0.20 + jitter('forage-habitat');
  weights.hunt.energyLow = 0.62 + jitter('hunt-energy');
  weights.hunt.preyOpportunity = 1.02 + jitter('hunt-prey');
  weights.hunt.threat = -0.30 + jitter('hunt-threat');
  weights.hunt.sleepDebt = -0.22 + jitter('hunt-sleep');
  weights.flee.threat = 1.12 + jitter('flee-threat');
  weights.flee.soilToxin = 0.62 + jitter('flee-toxin');
  weights.flee.habitatStress = 0.35 + jitter('flee-habitat');
  weights.flee.energyLow = -0.10 + jitter('flee-energy');
  weights.flock.kinDensity = 0.94 + jitter('flock-kin');
  weights.flock.threat = 0.26 + jitter('flock-threat');
  weights.flock.foodScarcity = -0.12 + jitter('flock-food');
  weights.rest.sleepDebt = 1.18 + jitter('rest-sleep');
  weights.rest.energyLow = -0.42 + jitter('rest-energy');
  weights.rest.threat = -0.86 + jitter('rest-threat');
  weights.rest.foodScarcity = -0.18 + jitter('rest-food');
  weights.explore.foodScarcity = 0.58 + jitter('explore-food');
  weights.explore.habitatStress = 0.70 + jitter('explore-habitat');
  weights.explore.kinDensity = -0.16 + jitter('explore-kin');
  weights.explore.sleepDebt = -0.24 + jitter('explore-sleep');

  const hetero = clamp(genome.heterotrophy);
  const aggression = clamp(genome.aggression);
  const social = clamp(genome.sociality);
  const dormancy = clamp(genome.dormancy);
  const motility = clamp(genome.motility);
  const brainSpeed = clamp(genome.brainSpeed);
  const sense = clamp(genome.sense);
  const armor = clamp(genome.armor);
  return {
    bias: {
      forage: clampSigned(-0.05 + hetero * 0.45 + jitter('bias-forage')),
      hunt: clampSigned(-0.48 + aggression * 0.82 + hetero * 0.30 + jitter('bias-hunt')),
      flee: clampSigned(-0.12 + sense * 0.18 - armor * 0.18 + jitter('bias-flee')),
      flock: clampSigned(-0.30 + social * 0.72 + jitter('bias-flock')),
      rest: clampSigned(-0.25 + dormancy * 0.58 + jitter('bias-rest')),
      explore: clampSigned(-0.08 + motility * 0.42 + brainSpeed * 0.25 + jitter('bias-explore')),
    },
    weights,
    memoryStrength: clamp(0.12 + brainSpeed * 0.55 + r('memory') * 0.10),
    decisionRate: clamp(0.26 + brainSpeed * 0.58 + sense * 0.10 + r('rate') * 0.06),
    inhibition: clamp(0.12 + brainSpeed * 0.22 + r('inhibition') * 0.12),
  };
}

function mutateBrain(parent, seed, scale = 0.075) {
  const brain = copyBrain(parent);
  for (const action of ACTIONS) {
    brain.bias[action] = clampSigned(brain.bias[action] + (hash01(`${seed}:bias:${action}`) - 0.5) * scale * 2);
    for (const sensor of SENSORS) brain.weights[action][sensor] = clampSigned(brain.weights[action][sensor] + (hash01(`${seed}:${action}:${sensor}`) - 0.5) * scale * 2);
  }
  brain.memoryStrength = clamp(brain.memoryStrength + (hash01(`${seed}:memory`) - 0.5) * scale);
  brain.decisionRate = clamp(brain.decisionRate + (hash01(`${seed}:rate`) - 0.5) * scale);
  brain.inhibition = clamp(brain.inhibition + (hash01(`${seed}:inhibition`) - 0.5) * scale);
  return brain;
}

function averageBrains(brains) {
  if (!brains.length) return null;
  const out = copyBrain(brains[0]);
  for (const action of ACTIONS) {
    out.bias[action] = 0;
    for (const sensor of SENSORS) out.weights[action][sensor] = 0;
  }
  out.memoryStrength = 0; out.decisionRate = 0; out.inhibition = 0;
  for (const brain of brains) {
    for (const action of ACTIONS) {
      out.bias[action] += brain.bias[action];
      for (const sensor of SENSORS) out.weights[action][sensor] += brain.weights[action][sensor];
    }
    out.memoryStrength += brain.memoryStrength;
    out.decisionRate += brain.decisionRate;
    out.inhibition += brain.inhibition;
  }
  const n = brains.length;
  for (const action of ACTIONS) {
    out.bias[action] /= n;
    for (const sensor of SENSORS) out.weights[action][sensor] /= n;
  }
  out.memoryStrength /= n; out.decisionRate /= n; out.inhibition /= n;
  return out;
}

async function waitForRuntime() {
  while (true) {
    const origin = window.realitySandboxOriginMotileLifeV47;
    const inheritance = window.realitySandboxMorphogenesisInheritanceCacheV48a;
    const nutrients = window.realitySandboxClosedNutrientCycleV49;
    const planet = window.realitySandboxPlanet;
    const modules = window.realitySandboxModules;
    const components = planet?.world?.ecs?.components;
    if (origin?.installed && inheritance?.installed && nutrients?.installed && components?.motile instanceof Map && modules?.step) return { origin, nutrients, planet, modules };
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ origin, nutrients, planet, modules }) {
  if (window.realitySandboxEvolvingBrainsV50?.installed) return;
  const { world } = planet;
  const { motile, resource, detritus, position, velocity } = world.ecs.components;
  const lineagePrototypes = new Map();
  const actionCounts = Object.fromEntries(ACTIONS.map(action => [action, 0]));
  let accumulator = 0, prototypeAccumulator = 0, decisions = 0, sensorEvaluations = 0, spatialGridBuilds = 0;
  let brainsAssigned = 0, lineageInheritedBrains = 0, parentLineageInheritedBrains = 0, founderBrains = 0, prototypeRefreshes = 0;

  function cellKey(x, y) { return `${Math.floor(wrap(x, world.width) / CELL_SIZE)}:${Math.floor(wrap(y, world.height) / CELL_SIZE)}`; }
  function neighborKeys(x, y) {
    const cx = Math.floor(wrap(x, world.width) / CELL_SIZE), cy = Math.floor(wrap(y, world.height) / CELL_SIZE);
    const nx = Math.max(1, Math.ceil(world.width / CELL_SIZE)), ny = Math.max(1, Math.ceil(world.height / CELL_SIZE));
    const keys = [];
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) keys.push(`${(cx + ox + nx) % nx}:${(cy + oy + ny) % ny}`);
    return keys;
  }
  function buildGrid(component) {
    const grid = new Map();
    for (const [id] of component.entries()) {
      const p = position.get(id); if (!p) continue;
      const key = cellKey(p.x, p.y); let bucket = grid.get(key); if (!bucket) grid.set(key, bucket = []); bucket.push(id);
    }
    return grid;
  }

  function refreshPrototypes() {
    const buckets = new Map();
    for (const [, organism] of motile.entries()) {
      if (!organism.lineageId || !organism.brainV50?.genome) continue;
      let bucket = buckets.get(organism.lineageId); if (!bucket) buckets.set(organism.lineageId, bucket = []); bucket.push(organism.brainV50.genome);
    }
    for (const [lineageId, brains] of buckets) { const mean = averageBrains(brains); if (mean) lineagePrototypes.set(lineageId, mean); }
    prototypeRefreshes++;
  }
  function parentPrototype(lineageId) {
    const direct = lineagePrototypes.get(lineageId); if (direct) return { brain: direct, mode: 'lineage' };
    const ancestry = origin.getAncestry?.() || [];
    for (let index = ancestry.length - 1; index >= 0; index--) {
      const event = ancestry[index]; if (String(event?.childId || '') !== lineageId) continue;
      const parentId = String(event?.parentId || ''), parent = lineagePrototypes.get(parentId);
      if (parent) return { brain: parent, mode: 'parent-lineage', parentId };
      break;
    }
    return null;
  }
  function assignBrain(id, organism) {
    if (!organism || organism.brainV50?.genome || !organism.genome) return;
    const lineageId = String(organism.lineageId || 'unclassified');
    const inherited = parentPrototype(lineageId);
    const seed = `${world.seed || 'nysa'}:brain-v50:${lineageId}:${id}:${organism.generation || 0}`;
    const brain = inherited?.brain ? mutateBrain(inherited.brain, seed) : founderBrain(organism.genome, seed);
    if (inherited?.mode === 'lineage') lineageInheritedBrains++; else if (inherited?.mode === 'parent-lineage') parentLineageInheritedBrains++; else founderBrains++;
    organism.brainV50 = {
      genome: brain, lastAction: 'explore', activation: Object.fromEntries(ACTIONS.map(action => [action, 0])),
      sensors: Object.fromEntries(SENSORS.map(sensor => [sensor, 0])), cooldown: 0, decisionCount: 0,
      inheritedBy: inherited?.mode || 'founder', parentLineageId: inherited?.parentId || null,
    };
    if (!lineagePrototypes.has(lineageId)) lineagePrototypes.set(lineageId, copyBrain(brain));
    brainsAssigned++;
  }

  for (const [id, organism] of motile.entries()) assignBrain(id, organism);
  refreshPrototypes();
  const nativeSet = motile.set.bind(motile);
  motile.set = function v50BrainInheritance(id, organism) { const result = nativeSet(id, organism); assignBrain(id, organism); return result; };

  function nearbyMotiles(id, p, motileGrid, radius) {
    const out = [];
    for (const key of neighborKeys(p.x, p.y)) for (const otherId of motileGrid.get(key) || []) {
      if (otherId === id) continue;
      const other = motile.get(otherId), op = position.get(otherId); if (!other || !op) continue;
      const d = distance(p, op, world); if (d <= radius) out.push({ id: otherId, organism: other, p: op, d });
    }
    return out;
  }
  function nearestFood(p, resourceGrid, detritusGrid, radius, genome) {
    let best = null, bestD = radius;
    for (const key of neighborKeys(p.x, p.y)) {
      for (const id of resourceGrid.get(key) || []) {
        const res = resource.get(id), rp = position.get(id); if (!res || !rp || (res.amount || 0) <= 0.02) continue;
        const d = distance(p, rp, world); if (d < bestD) { bestD = d; best = { id, p: rp, d, kind: 'plant', amount: res.amount || 0 }; }
      }
      if (clamp(genome.scavenging) > 0.18) for (const id of detritusGrid.get(key) || []) {
        const det = detritus.get(id), dp = position.get(id); if (!det || !dp || (det.amount || 0) <= 0.02) continue;
        const d = distance(p, dp, world); if (d < bestD) { bestD = d; best = { id, p: dp, d, kind: 'detritus', amount: det.amount || 0 }; }
      }
    }
    return best;
  }

  function sensorsFor(id, organism, p, nearby, resourceGrid, detritusGrid) {
    const genome = organism.genome || {}, senseRadius = 38 + clamp(genome.sense) * 160;
    const food = nearestFood(p, resourceGrid, detritusGrid, senseRadius, genome);
    let kin = 0, prey = 0, threat = 0, nearestPrey = null, nearestThreat = null, kinX = 0, kinY = 0;
    const ownSize = clamp(genome.bodySize), ownArmor = clamp(genome.armor);
    for (const other of nearby) {
      const otherGenome = other.organism.genome || {};
      if (other.organism.lineageId === organism.lineageId) { kin++; kinX += wrappedDelta(other.p.x, p.x, world.width); kinY += wrappedDelta(other.p.y, p.y, world.height); continue; }
      const otherSize = clamp(otherGenome.bodySize), otherAggression = clamp(otherGenome.aggression);
      const preyScore = clamp((ownSize - otherSize + 0.35) * 0.55 + clamp(genome.aggression) * 0.45);
      const threatScore = clamp((otherSize - ownSize + 0.35) * 0.55 + otherAggression * 0.55 - ownArmor * 0.18);
      if (preyScore > 0.40) { prey += preyScore; if (!nearestPrey || other.d < nearestPrey.d) nearestPrey = other; }
      if (threatScore > 0.38) { threat += threatScore; if (!nearestThreat || other.d < nearestThreat.d) nearestThreat = other; }
    }
    const nutrient = nutrients.sample(p.x, p.y), habitatFitness = clamp(organism.bioV48?.habitatFitness ?? 0.55);
    const foodAvailability = food ? clamp((food.amount || 0) * (1 - food.d / Math.max(1, senseRadius))) : 0;
    const sensors = {
      energyLow: clamp(1 - (Number(organism.energy) || 0) / 2.7), foodScarcity: clamp(1 - foodAvailability),
      preyOpportunity: clamp(prey / 2.2), threat: clamp(threat / 2.0), kinDensity: clamp(kin / 7),
      sleepDebt: clamp((Number(organism.sleepDebt) || 0) / 1.2), soilToxin: clamp(nutrient?.toxin), habitatStress: clamp(1 - habitatFitness),
    };
    sensorEvaluations++;
    return { sensors, food, nearestPrey, nearestThreat, kinCenter: kin ? { x: wrap(p.x + kinX / kin, world.width), y: wrap(p.y + kinY / kin, world.height) } : null };
  }

  function activationFor(brainState, organism, sensors) {
    const brain = brainState.genome, genome = organism.genome || {}, phenotype = organism.bioV48?.phenotype || {};
    const traitBias = {
      forage: clamp(genome.heterotrophy) * 0.24 + clamp(genome.scavenging) * 0.08,
      hunt: clamp(genome.aggression) * 0.36 + clamp(genome.heterotrophy) * 0.16 + clamp(phenotype.neuralComplexity) * 0.08,
      flee: clamp(genome.sense) * 0.10 + clamp(phenotype.neuralComplexity) * 0.06,
      flock: clamp(genome.sociality) * 0.30, rest: clamp(genome.dormancy) * 0.24,
      explore: clamp(genome.motility) * 0.18 + clamp(genome.brainSpeed) * 0.12,
    };
    const activation = {};
    for (const action of ACTIONS) {
      let sum = brain.bias[action] + traitBias[action];
      for (const sensor of SENSORS) sum += brain.weights[action][sensor] * sensors[sensor];
      if (brainState.lastAction === action) sum += brain.memoryStrength * 0.30;
      if (action !== 'flee' && sensors.threat > 0.65) sum -= brain.inhibition * sensors.threat * 0.18;
      activation[action] = Math.tanh(sum);
    }
    return activation;
  }

  function steerToward(vel, p, target, speed, blend = 0.72) {
    if (!target) return; const dx = wrappedDelta(target.x, p.x, world.width), dy = wrappedDelta(target.y, p.y, world.height), d = Math.hypot(dx, dy) || 1;
    vel.vx = vel.vx * blend + (dx / d) * speed * (1 - blend); vel.vy = vel.vy * blend + (dy / d) * speed * (1 - blend);
  }
  function steerAway(vel, p, target, speed, blend = 0.62) {
    if (!target) return; const dx = wrappedDelta(p.x, target.x, world.width), dy = wrappedDelta(p.y, target.y, world.height), d = Math.hypot(dx, dy) || 1;
    vel.vx = vel.vx * blend + (dx / d) * speed * (1 - blend); vel.vy = vel.vy * blend + (dy / d) * speed * (1 - blend);
  }
  function applyAction(id, organism, p, vel, action, context) {
    const genome = organism.genome || {}, neural = clamp(organism.bioV48?.phenotype?.neuralComplexity ?? genome.brainSpeed);
    const speed = 5 + clamp(genome.motility) * 31 + clamp(organism.bioV48?.phenotype?.contractility) * 7;
    if (action === 'forage' && context.food) steerToward(vel, p, context.food.p, speed, 0.68 - neural * 0.12);
    else if (action === 'hunt' && context.nearestPrey) steerToward(vel, p, context.nearestPrey.p, speed * 1.08, 0.64 - neural * 0.14);
    else if (action === 'flee') {
      if (context.nearestThreat) steerAway(vel, p, context.nearestThreat.p, speed * 1.12, 0.56 - neural * 0.10);
      else { const angle = hash01(`${world.seed}:brain-flee:${id}:${Math.floor(world.tick / 12)}`) * Math.PI * 2; vel.vx += Math.cos(angle) * speed * 0.16; vel.vy += Math.sin(angle) * speed * 0.16; }
    } else if (action === 'flock' && context.kinCenter) steerToward(vel, p, context.kinCenter, speed * 0.76, 0.84 - clamp(genome.sociality) * 0.12);
    else if (action === 'rest') {
      if ((organism.energy || 0) > 0.28 && (organism.sleepDebt || 0) > 0.34 && context.sensors.threat < 0.42) { organism.state = 'sleeping'; vel.vx *= 0.45; vel.vy *= 0.45; }
    } else if (action === 'explore') {
      const angle = hash01(`${world.seed}:brain-explore:${id}:${Math.floor(world.tick / 18)}`) * Math.PI * 2;
      vel.vx = vel.vx * 0.82 + Math.cos(angle) * speed * 0.18; vel.vy = vel.vy * 0.82 + Math.sin(angle) * speed * 0.18;
    }
  }

  function decide(dt) {
    const motileGrid = buildGrid(motile), resourceGrid = buildGrid(resource), detritusGrid = buildGrid(detritus); spatialGridBuilds += 3;
    for (const [id, organism] of motile.entries()) {
      assignBrain(id, organism);
      const brainState = organism.brainV50, p = position.get(id), vel = velocity.get(id); if (!brainState || !p || !vel) continue;
      brainState.cooldown -= dt; if (brainState.cooldown > 0) continue;
      const senseRadius = 38 + clamp(organism.genome?.sense) * 160;
      const nearby = nearbyMotiles(id, p, motileGrid, senseRadius), context = sensorsFor(id, organism, p, nearby, resourceGrid, detritusGrid);
      const activation = activationFor(brainState, organism, context.sensors);
      let chosen = 'explore', best = -Infinity; for (const action of ACTIONS) if (activation[action] > best) { best = activation[action]; chosen = action; }
      brainState.sensors = { ...context.sensors }; brainState.activation = activation; brainState.lastAction = chosen; brainState.decisionCount++;
      brainState.cooldown = Math.max(0.16, 1.25 - brainState.genome.decisionRate * 0.92);
      applyAction(id, organism, p, vel, chosen, context); actionCounts[chosen]++; decisions++;
    }
  }

  const previousStep = modules.step.bind(modules);
  modules.step = function v50EvolvingBrainStep(dt) {
    const result = previousStep(dt), elapsed = Number(dt) || 0; accumulator += elapsed; prototypeAccumulator += elapsed;
    if (prototypeAccumulator >= PROTOTYPE_REFRESH_SECONDS) { prototypeAccumulator %= PROTOTYPE_REFRESH_SECONDS; refreshPrototypes(); }
    if (accumulator >= STEP_SECONDS) { const decisionDt = accumulator; accumulator = 0; decide(decisionDt); }
    return result;
  };

  function getBrain(id) {
    const state = motile.get(id)?.brainV50; if (!state) return null;
    return { genome: copyBrain(state.genome), lastAction: state.lastAction, activation: { ...state.activation }, sensors: { ...state.sensors }, decisionCount: state.decisionCount, inheritedBy: state.inheritedBy, parentLineageId: state.parentLineageId };
  }
  function getLineageBrains() {
    const buckets = new Map();
    for (const [, organism] of motile.entries()) {
      if (!organism.lineageId || !organism.brainV50?.genome) continue;
      let bucket = buckets.get(organism.lineageId); if (!bucket) buckets.set(organism.lineageId, bucket = { brains: [], actions: Object.fromEntries(ACTIONS.map(action => [action, 0])), population: 0 });
      bucket.brains.push(organism.brainV50.genome); bucket.actions[organism.brainV50.lastAction] = (bucket.actions[organism.brainV50.lastAction] || 0) + 1; bucket.population++;
    }
    return [...buckets.entries()].map(([lineageId, bucket]) => ({ lineageId, population: bucket.population, brain: averageBrains(bucket.brains), currentActions: { ...bucket.actions } }));
  }

  const api = {
    installed: true, sensors: SENSORS.slice(), actions: ACTIONS.slice(), getBrain, getLineageBrains, refreshPrototypes,
    getStats: () => ({ installed: true, decisions, sensorEvaluations, spatialGridBuilds, brainsAssigned, lineageInheritedBrains, parentLineageInheritedBrains, founderBrains, prototypeRefreshes, lineagePrototypes: lineagePrototypes.size, actionCounts: { ...actionCounts }, sensors: SENSORS.slice(), actions: ACTIONS.slice(), inheritedSensorActionWeights: true, behaviorAffectsMovementAndRest: true, behaviorSelectionThroughEcology: true, spatiallyHashedSensing: true, hardPopulationCap: false, hardDisplayCap: false, surfaceRendererEnabled: false, authoritativeFixedStep: true }),
  };
  window.realitySandboxEvolvingBrainsV50 = api;
  window.realitySandboxEvolutionBuild = 'evolution-v50-evolving-brains';
  document.documentElement.dataset.evolutionBuild = 'evolution-v50-evolving-brains';
  document.documentElement.dataset.evolvingBrainsV50 = 'inherited-sensor-action-network';
}

waitForRuntime().then(install);