const STEP_SECONDS = 0.9;
const CELL_SIZE = 116;
const TOKENS = ['ka','ti','mu','sa','lo','ne'];
const MEANINGS = ['food-route','danger-avoidance','pack-hunt'];
const MAX_LEXICON = TOKENS.length;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number(v) || 0));
const wrap = (v, max) => ((v % max) + max) % max;

function hash32(text) {
  let h = 2166136261 >>> 0;
  for (const ch of String(text)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

async function waitForRuntime() {
  while (true) {
    const culture = window.realitySandboxProtoCultureV53;
    const memory = window.realitySandboxLearningMemoryV52;
    const social = window.realitySandboxSocialSignalingV51;
    const brain = window.realitySandboxSensoryBrainsV50;
    const origin = window.realitySandboxOriginMotileLifeV47;
    const planet = window.realitySandboxPlanet;
    const modules = window.realitySandboxModules;
    const c = planet?.world?.ecs?.components;
    if (culture?.installed && memory?.installed && social?.installed && brain?.installed && origin?.installed && modules?.step && c?.motile instanceof Map && c?.position instanceof Map && c?.velocity instanceof Map) {
      return { culture, memory, social, brain, origin, planet, modules };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ planet, modules }) {
  if (window.realitySandboxProtoLanguageV54?.installed) return;
  const { world } = planet;
  const { motile, position, velocity } = world.ecs.components;
  const cols = Math.max(1, Math.ceil(world.width / CELL_SIZE));
  const rows = Math.max(1, Math.ceil(world.height / CELL_SIZE));
  const seed = window.realitySandboxSeed?.numericSeed || world.seed || 'nysa';
  let accumulator = 0;
  let stepCount = 0;

  const stats = {
    steps:0,
    symbolEmissions:0,
    symbolHearings:0,
    groundedHearings:0,
    ungroundedHearings:0,
    associationsLearned:0,
    associationsReinforced:0,
    ambiguousRepairs:0,
    symbolInnovations:0,
    conventionCopies:0,
    successfulInterpretations:0,
    symbolicGuidanceEvents:0,
    activeLexiconEntries:0,
    sharedConventions:0,
    linguisticLineages:0,
    meanVocality:0,
    meanReceptivity:0,
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
      for (let ox = -rings; ox <= rings; ox++) out.push(`${(cx + ox + cols) % cols}:${Math.max(0, Math.min(rows - 1, cy + oy))}`);
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
    const motility = clamp(g.motility);
    return {
      vocality:clamp(0.06 + sociality * 0.44 + brainSpeed * 0.32 + sense * 0.18),
      receptivity:clamp(0.08 + brainSpeed * 0.42 + sense * 0.31 + sociality * 0.19),
      signalRadius:42 + sense * 142 + sociality * 72,
      locomotorSpeed:7 + motility * 36,
    };
  }

  function ensureState(organism, ph) {
    if (!organism.bioV54) {
      organism.bioV54 = {
        vocality:ph.vocality,
        receptivity:ph.receptivity,
        lexicon:{},
        production:{},
        inventionCounter:0,
        lastEmission:null,
        lastHeard:null,
        interpretedMeaning:null,
        appliedLanguageAction:null,
      };
    }
    organism.bioV54.vocality = ph.vocality;
    organism.bioV54.receptivity = ph.receptivity;
    return organism.bioV54;
  }

  function strongestKnownPractice(organism) {
    const practices = organism.bioV53?.practices || {};
    let best = null;
    let strength = 0;
    for (const meaning of MEANINGS) {
      const candidate = clamp(practices[meaning]?.strength);
      if (candidate > strength) { best = meaning; strength = candidate; }
    }
    return strength >= 0.42 ? best : null;
  }

  function inferContext(organism) {
    const culture = organism.bioV53;
    const memory = organism.bioV52;
    const brain = organism.bioV50 || {};
    if (culture?.appliedPractice && MEANINGS.includes(culture.appliedPractice)) return culture.appliedPractice;
    const knownPractice = strongestKnownPractice(organism);
    if (knownPractice) return knownPractice;
    if (memory?.recalledAction === 'seek-food') return 'food-route';
    if (memory?.recalledAction === 'avoid-danger') return 'danger-avoidance';
    if (memory?.recalledAction === 'seek-prey') return 'pack-hunt';
    if (brain.mode === 'graze' || brain.mode === 'scavenge') return 'food-route';
    if (brain.mode === 'flee') return 'danger-avoidance';
    if (brain.mode === 'hunt') return 'pack-hunt';
    return null;
  }

  function meaningTarget(organism, meaning) {
    const practice = organism.bioV53?.practices?.[meaning];
    if (practice) return { x:practice.x, y:practice.y, strength:practice.strength };
    const memoryName = meaning === 'food-route' ? 'food' : meaning === 'danger-avoidance' ? 'danger' : 'hunt';
    const memory = organism.bioV52?.memories?.[memoryName];
    if (memory) return { x:memory.x, y:memory.y, strength:memory.strength };
    return null;
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

  function knownTokenForMeaning(state, meaning) {
    const produced = state.production[meaning];
    if (produced && state.lexicon[produced]?.meaning === meaning && state.lexicon[produced].confidence >= 0.34) return produced;
    let best = null;
    let confidence = 0;
    for (const [token, entry] of Object.entries(state.lexicon)) {
      if (entry.meaning === meaning && entry.confidence > confidence) { best = token; confidence = entry.confidence; }
    }
    if (best && confidence >= 0.38) {
      if (state.production[meaning] !== best) stats.conventionCopies++;
      state.production[meaning] = best;
      return best;
    }
    return null;
  }

  function inventToken(id, state) {
    const start = hash32(`${seed}:${id}:v54b:${state.inventionCounter++}`) % TOKENS.length;
    for (let offset = 0; offset < TOKENS.length; offset++) {
      const token = TOKENS[(start + offset) % TOKENS.length];
      if (!state.lexicon[token]) { stats.symbolInnovations++; return token; }
    }
    stats.symbolInnovations++;
    return TOKENS[start];
  }

  function associate(state, token, meaning, evidence, sourceId) {
    if (!TOKENS.includes(token) || !MEANINGS.includes(meaning)) return false;
    const incoming = clamp(evidence) * (0.52 + state.receptivity * 0.48);
    const existing = state.lexicon[token];
    if (!existing) {
      if (Object.keys(state.lexicon).length >= MAX_LEXICON) {
        const weakest = Object.entries(state.lexicon).sort((a,b) => a[1].confidence - b[1].confidence)[0];
        if (!weakest || weakest[1].confidence >= incoming) return false;
        delete state.lexicon[weakest[0]];
      }
      state.lexicon[token] = { meaning, confidence:clamp(0.14 + incoming * 0.74), learnedFrom:sourceId, updatedAtStep:stepCount };
      stats.associationsLearned++;
      return true;
    }
    if (existing.meaning === meaning) {
      existing.confidence = clamp(existing.confidence * 0.75 + incoming * 0.43);
      existing.learnedFrom = sourceId;
      existing.updatedAtStep = stepCount;
      stats.associationsReinforced++;
      return true;
    }
    if (incoming > existing.confidence + 0.12) {
      existing.meaning = meaning;
      existing.confidence = clamp(incoming * 0.72);
      existing.learnedFrom = sourceId;
      existing.updatedAtStep = stepCount;
      stats.ambiguousRepairs++;
      return true;
    }
    existing.confidence *= 0.92;
    stats.ambiguousRepairs++;
    return false;
  }

  function emitSymbol(id, organism, state, ph) {
    const meaning = inferContext(organism);
    if (!meaning || ph.vocality < 0.30 || organism.state === 'sleeping') return null;
    let token = knownTokenForMeaning(state, meaning);
    if (!token) {
      token = inventToken(id, state);
      state.production[meaning] = token;
      associate(state, token, meaning, 0.48 + ph.vocality * 0.34, id);
    }
    const strength = clamp(0.32 + ph.vocality * 0.48 + clamp(organism.bioV53?.practices?.[meaning]?.strength) * 0.20);
    state.lastEmission = { token, step:stepCount };
    stats.symbolEmissions++;
    return { token, emitterId:id, lineageId:organism.lineageId, radius:ph.signalRadius, strength };
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

  function applyMeaning(organism, state, meaning, p, vel, ph) {
    state.appliedLanguageAction = null;
    const target = meaningTarget(organism, meaning);
    if (!target || target.strength < 0.18 || organism.state === 'sleeping') return false;
    if (meaning === 'danger-avoidance') steerAway(vel, p, target, ph.locomotorSpeed * 0.78, 0.81);
    else if (meaning === 'food-route') steer(vel, p, target, ph.locomotorSpeed * 0.68, 0.83);
    else steer(vel, p, target, ph.locomotorSpeed * 0.82, 0.79);
    state.appliedLanguageAction = meaning;
    stats.symbolicGuidanceEvents++;
    return true;
  }

  function languageStep() {
    const grid = buildGrid();
    const emissions = [];
    let vocality = 0;
    let receptivity = 0;
    let population = 0;

    for (const [id, organism] of motile.entries()) {
      const p = position.get(id);
      if (!p) continue;
      const ph = phenotype(organism.genome);
      const state = ensureState(organism, ph);
      state.interpretedMeaning = null;
      state.appliedLanguageAction = null;
      const emission = emitSymbol(id, organism, state, ph);
      if (emission) emissions.push(emission);
      vocality += ph.vocality;
      receptivity += ph.receptivity;
      population++;
    }

    for (const emission of emissions) {
      const emitterPos = position.get(emission.emitterId);
      if (!emitterPos) continue;
      const rings = Math.max(1, Math.min(3, Math.ceil(emission.radius / CELL_SIZE)));
      for (const key of neighborKeys(emitterPos.x, emitterPos.y, rings)) {
        for (const receiverId of grid.get(key) || []) {
          if (receiverId === emission.emitterId) continue;
          const receiver = motile.get(receiverId);
          const rp = position.get(receiverId);
          const vel = velocity.get(receiverId);
          if (!receiver || !rp || !vel || receiver.lineageId !== emission.lineageId) continue;
          const d = distance(emitterPos, rp);
          if (d > emission.radius) continue;
          const rph = phenotype(receiver.genome);
          const reception = clamp(emission.strength * rph.receptivity * (1 - d / Math.max(1, emission.radius) * 0.45));
          if (reception < 0.18) continue;

          const state = ensureState(receiver, rph);
          state.lastHeard = { token:emission.token, emitterId:emission.emitterId, step:stepCount };
          stats.symbolHearings++;

          const receiverContext = inferContext(receiver);
          if (receiverContext) {
            associate(state, emission.token, receiverContext, reception, emission.emitterId);
            stats.groundedHearings++;
          } else {
            stats.ungroundedHearings++;
          }

          const entry = state.lexicon[emission.token];
          if (!entry || entry.confidence < 0.34) continue;
          state.interpretedMeaning = entry.meaning;
          stats.successfulInterpretations++;
          applyMeaning(receiver, state, entry.meaning, rp, vel, rph);
        }
      }
    }

    const lineages = new Set();
    const shared = new Map();
    let active = 0;
    for (const organism of motile.values()) {
      const state = organism.bioV54;
      if (!state) continue;
      const entries = Object.entries(state.lexicon).filter(([, entry]) => entry.confidence >= 0.24);
      active += entries.length;
      if (entries.length) lineages.add(organism.lineageId);
      for (const [token, entry] of entries) {
        const key = `${organism.lineageId}:${token}:${entry.meaning}`;
        shared.set(key, (shared.get(key) || 0) + 1);
      }
    }

    stepCount++;
    stats.steps = stepCount;
    stats.activeLexiconEntries = active;
    stats.sharedConventions = [...shared.values()].filter(count => count >= 2).length;
    stats.linguisticLineages = lineages.size;
    stats.meanVocality = population ? vocality / population : 0;
    stats.meanReceptivity = population ? receptivity / population : 0;
  }

  const previousStep = modules.step.bind(modules);
  modules.step = function v54bReceiverGroundedProtoLanguageStep(dt) {
    const result = previousStep(dt);
    accumulator += Number(dt) || 0;
    if (accumulator >= STEP_SECONDS) {
      accumulator = 0;
      languageStep();
    }
    return result;
  };

  const api = {
    installed:true,
    getStats:() => ({
      ...stats,
      installed:true,
      version:'v54b-receiver-grounded',
      semanticallyNeutralTokens:true,
      meaningAcquiredByAssociation:true,
      learnedSymbolMeanings:true,
      receiverGroundedAssociations:true,
      noSpeakerMeaningMetadata:true,
      retainedCulturalKnowledgeCanBeReferenced:true,
      physicallyLocalTransmission:true,
      kinBiasedTransmission:true,
      culturallyBlankLexiconAtBirth:true,
      learnedConventionsCanBeProduced:true,
      symbolUseAffectsBehavior:true,
      boundedLexicon:true,
      maxLexiconEntries:MAX_LEXICON,
      tokenInventory:TOKENS.slice(),
      meaningTypes:MEANINGS.slice(),
      spatialHashing:true,
      authoritativeFixedStep:true,
      noHardPopulationCap:true,
      noHardDisplayCap:true,
      surfaceRendererEnabled:false,
    }),
    getLanguage(id) {
      const state = motile.get(id)?.bioV54;
      if (!state) return null;
      return {
        vocality:state.vocality,
        receptivity:state.receptivity,
        lexicon:Object.fromEntries(Object.entries(state.lexicon).map(([token, entry]) => [token, { ...entry }])),
        production:{ ...state.production },
        lastEmission:state.lastEmission ? { ...state.lastEmission } : null,
        lastHeard:state.lastHeard ? { ...state.lastHeard } : null,
        interpretedMeaning:state.interpretedMeaning,
        appliedLanguageAction:state.appliedLanguageAction,
      };
    },
    getPopulationLanguage() {
      return [...motile.entries()].map(([id, organism]) => ({ id, lineageId:organism.lineageId, generation:organism.generation || 0, language:api.getLanguage(id) })).filter(item => item.language);
    },
  };

  window.realitySandboxProtoLanguageV54 = api;
  window.realitySandboxEvolutionBuild = 'evolution-v54-proto-language';
  document.documentElement.dataset.evolutionBuild = 'evolution-v54-proto-language';
  document.documentElement.dataset.protoLanguageV54 = 'receiver-grounded-symbol-association';
}

waitForRuntime().then(install);
