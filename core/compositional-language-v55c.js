const STEP_SECONDS = 0.9;
const CELL_SIZE = 118;
const REFERENTS = ['food','danger','prey'];
const MODIFIERS = ['there','avoid','together'];
const PRIMITIVES = [...REFERENTS, ...MODIFIERS];
const MODIFIER_TOKENS = ['ra','vi','zo'];
const V54_MEANINGS = ['food-route','danger-avoidance','pack-hunt'];
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
    const language = window.realitySandboxProtoLanguageV54;
    const culture = window.realitySandboxProtoCultureV53;
    const memory = window.realitySandboxLearningMemoryV52;
    const brain = window.realitySandboxSensoryBrainsV50;
    const origin = window.realitySandboxOriginMotileLifeV47;
    const planet = window.realitySandboxPlanet;
    const modules = window.realitySandboxModules;
    const c = planet?.world?.ecs?.components;
    if (language?.installed && culture?.installed && memory?.installed && brain?.installed && origin?.installed && modules?.step && c?.motile instanceof Map && c?.position instanceof Map && c?.velocity instanceof Map) {
      return { language, planet, modules };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ language, planet, modules }) {
  if (window.realitySandboxCompositionalLanguageV55?.installed) return;
  const { world } = planet;
  const { motile, position, velocity } = world.ecs.components;
  const rootTokens = language.getStats?.().tokenInventory?.slice() || ['ka','ti','mu','sa','lo','ne'];
  const allTokens = [...rootTokens, ...MODIFIER_TOKENS];
  const maxLexicon = allTokens.length;
  const seed = window.realitySandboxSeed?.numericSeed || world.seed || 'nysa';
  const cols = Math.max(1, Math.ceil(world.width / CELL_SIZE));
  const rows = Math.max(1, Math.ceil(world.height / CELL_SIZE));
  let accumulator = 0;
  let stepCount = 0;

  const pairIndex = new Map();
  let pairCursor = 0;
  for (const referent of REFERENTS) for (const modifier of MODIFIERS) pairIndex.set(`${referent}:${modifier}`, pairCursor++);

  const stats = {
    steps:0,
    phraseEmissions:0,
    phraseHearings:0,
    anchoredPhraseHearings:0,
    unanchoredPhraseHearings:0,
    groundedPhraseHearings:0,
    ungroundedPhraseHearings:0,
    holophraseReanalyses:0,
    primitiveAssociationsLearned:0,
    primitiveAssociationsReinforced:0,
    primitiveRepairs:0,
    modifierInnovations:0,
    syntaxInnovations:0,
    syntaxCopies:0,
    successfulCompositions:0,
    novelCompositions:0,
    compositionalGuidanceEvents:0,
    activePrimitiveEntries:0,
    sharedPrimitiveConventions:0,
    sharedSyntaxConventions:0,
    compositionalLineages:0,
    meanCombinatorialCapacity:0,
    meanSyntaxLearning:0,
  };

  function keyFor(x, y) {
    const cx = Math.floor(wrap(x, world.width) / CELL_SIZE) % cols;
    const cy = Math.max(0, Math.min(rows - 1, Math.floor(Math.max(0, Math.min(world.height - 0.0001, y)) / CELL_SIZE)));
    return `${cx}:${cy}`;
  }

  function neighborKeys(x, y, rings = 1) {
    const cx = Math.floor(wrap(x, world.width) / CELL_SIZE) % cols;
    const cy = Math.max(0, Math.min(rows - 1, Math.floor(Math.max(0, Math.min(world.height - 0.0001, y)) / CELL_SIZE)));
    const keys = [];
    for (let oy = -rings; oy <= rings; oy++) {
      for (let ox = -rings; ox <= rings; ox++) keys.push(`${(cx + ox + cols) % cols}:${Math.max(0, Math.min(rows - 1, cy + oy))}`);
    }
    return keys;
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
      combinatorialCapacity:clamp(0.04 + brainSpeed * 0.48 + sense * 0.25 + sociality * 0.23),
      syntaxLearning:clamp(0.06 + brainSpeed * 0.38 + sociality * 0.34 + sense * 0.22),
      phraseRadius:44 + sense * 146 + sociality * 76,
      locomotorSpeed:7 + motility * 36,
    };
  }

  function ensureState(organism, ph) {
    if (!organism.bioV55) {
      organism.bioV55 = {
        combinatorialCapacity:ph.combinatorialCapacity,
        syntaxLearning:ph.syntaxLearning,
        lexicon:{},
        production:{},
        syntaxOrder:null,
        syntaxConfidence:0,
        inventionCounter:0,
        observedPairMask:0,
        lastPhrase:null,
        lastHeardPhrase:null,
        interpretedComposition:null,
        appliedComposition:null,
      };
    }
    organism.bioV55.combinatorialCapacity = ph.combinatorialCapacity;
    organism.bioV55.syntaxLearning = ph.syntaxLearning;
    return organism.bioV55;
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

  function pairForMeaning(meaning) {
    if (meaning === 'food-route') return { referent:'food', modifier:'there' };
    if (meaning === 'danger-avoidance') return { referent:'danger', modifier:'avoid' };
    if (meaning === 'pack-hunt') return { referent:'prey', modifier:'together' };
    return null;
  }

  function meaningForPair(pair) {
    if (!pair) return null;
    if (pair.referent === 'food' && pair.modifier === 'there') return 'food-route';
    if (pair.referent === 'danger' && pair.modifier === 'avoid') return 'danger-avoidance';
    if (pair.referent === 'prey' && pair.modifier === 'together') return 'pack-hunt';
    return null;
  }

  function strongestKnownPractice(organism) {
    const practices = organism.bioV53?.practices || {};
    let bestMeaning = null;
    let bestStrength = 0;
    for (const meaning of V54_MEANINGS) {
      const strength = clamp(practices[meaning]?.strength);
      if (strength > bestStrength) { bestMeaning = meaning; bestStrength = strength; }
    }
    return bestStrength >= 0.42 ? bestMeaning : null;
  }

  function inferPair(organism) {
    const culture = organism.bioV53;
    const memory = organism.bioV52;
    const brain = organism.bioV50 || {};
    if (culture?.appliedPractice) return pairForMeaning(culture.appliedPractice);
    const knownPractice = strongestKnownPractice(organism);
    if (knownPractice) return pairForMeaning(knownPractice);
    if (memory?.recalledAction === 'seek-food') return pairForMeaning('food-route');
    if (memory?.recalledAction === 'avoid-danger') return pairForMeaning('danger-avoidance');
    if (memory?.recalledAction === 'seek-prey') return pairForMeaning('pack-hunt');
    if (brain.mode === 'graze' || brain.mode === 'scavenge') return pairForMeaning('food-route');
    if (brain.mode === 'flee') return pairForMeaning('danger-avoidance');
    if (brain.mode === 'hunt') return pairForMeaning('pack-hunt');
    return null;
  }

  function targetForReferent(organism, referent) {
    const practiceName = referent === 'food' ? 'food-route' : referent === 'danger' ? 'danger-avoidance' : 'pack-hunt';
    const practice = organism.bioV53?.practices?.[practiceName];
    if (practice) return { x:practice.x, y:practice.y, strength:practice.strength };
    const memoryName = referent === 'food' ? 'food' : referent === 'danger' ? 'danger' : 'hunt';
    const memory = organism.bioV52?.memories?.[memoryName];
    if (memory) return { x:memory.x, y:memory.y, strength:memory.strength };
    return null;
  }

  function v54RootToken(organism, meaning) {
    const state = organism.bioV54;
    if (!state) return null;
    const produced = state.production?.[meaning];
    if (produced && state.lexicon?.[produced]?.meaning === meaning && state.lexicon[produced].confidence >= 0.34) return produced;
    let best = null;
    let confidence = 0;
    for (const [token, entry] of Object.entries(state.lexicon || {})) {
      if (entry.meaning === meaning && entry.confidence > confidence) { best = token; confidence = entry.confidence; }
    }
    return confidence >= 0.34 ? best : null;
  }

  function receiverHolophraseAnchor(organism, tokens) {
    const state = organism.bioV54;
    if (!state || !Array.isArray(tokens)) return null;
    let best = null;
    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index];
      const entry = state.lexicon?.[token];
      if (!entry || entry.confidence < 0.34 || !V54_MEANINGS.includes(entry.meaning)) continue;
      if (!best || entry.confidence > best.confidence) best = { token, index, meaning:entry.meaning, confidence:entry.confidence };
    }
    return best;
  }

  function pairBit(pair) {
    const index = pairIndex.get(`${pair.referent}:${pair.modifier}`);
    return Number.isInteger(index) ? (1 << index) : 0;
  }

  function hasObservedPair(state, pair) {
    const bit = pairBit(pair);
    return bit ? (state.observedPairMask & bit) !== 0 : false;
  }

  function markObservedPair(state, pair) {
    const bit = pairBit(pair);
    if (bit) state.observedPairMask |= bit;
  }

  function bestTokenForPrimitive(state, primitive) {
    const produced = state.production[primitive];
    if (produced && state.lexicon[produced]?.primitive === primitive && state.lexicon[produced].confidence >= 0.34) return produced;
    let best = null;
    let confidence = 0;
    for (const [token, entry] of Object.entries(state.lexicon)) {
      if (entry.primitive === primitive && entry.confidence > confidence) { best = token; confidence = entry.confidence; }
    }
    if (best && confidence >= 0.38) {
      state.production[primitive] = best;
      return best;
    }
    return null;
  }

  function associatePrimitive(state, token, primitive, evidence, sourceId) {
    if (!allTokens.includes(token) || !PRIMITIVES.includes(primitive)) return false;
    const incoming = clamp(evidence) * (0.44 + state.syntaxLearning * 0.30 + state.combinatorialCapacity * 0.26);
    const existing = state.lexicon[token];
    if (!existing) {
      if (Object.keys(state.lexicon).length >= maxLexicon) {
        const weakest = Object.entries(state.lexicon).sort((a,b) => a[1].confidence - b[1].confidence)[0];
        if (!weakest || weakest[1].confidence >= incoming) return false;
        delete state.lexicon[weakest[0]];
      }
      state.lexicon[token] = { primitive, confidence:clamp(0.14 + incoming * 0.74), learnedFrom:sourceId, updatedAtStep:stepCount };
      stats.primitiveAssociationsLearned++;
      return true;
    }
    if (existing.primitive === primitive) {
      existing.confidence = clamp(existing.confidence * 0.75 + incoming * 0.43);
      existing.learnedFrom = sourceId;
      existing.updatedAtStep = stepCount;
      stats.primitiveAssociationsReinforced++;
      return true;
    }
    if (incoming > existing.confidence + 0.14) {
      existing.primitive = primitive;
      existing.confidence = clamp(incoming * 0.74);
      existing.learnedFrom = sourceId;
      existing.updatedAtStep = stepCount;
      stats.primitiveRepairs++;
      return true;
    }
    existing.confidence *= 0.92;
    stats.primitiveRepairs++;
    return false;
  }

  function modifierTokenFor(id, state, modifier) {
    const known = bestTokenForPrimitive(state, modifier);
    if (known && MODIFIER_TOKENS.includes(known)) return known;
    const start = hash32(`${seed}:${id}:${modifier}:${state.inventionCounter++}`) % MODIFIER_TOKENS.length;
    for (let offset = 0; offset < MODIFIER_TOKENS.length; offset++) {
      const token = MODIFIER_TOKENS[(start + offset) % MODIFIER_TOKENS.length];
      const existing = state.lexicon[token];
      if (!existing || existing.primitive === modifier) {
        state.production[modifier] = token;
        associatePrimitive(state, token, modifier, 0.62, id);
        stats.modifierInnovations++;
        return token;
      }
    }
    return null;
  }

  function ensureSyntax(id, state) {
    if (state.syntaxOrder) return state.syntaxOrder;
    state.syntaxOrder = (hash32(`${seed}:${id}:syntax-v55c`) & 1) ? 'referent-modifier' : 'modifier-referent';
    state.syntaxConfidence = 0.52;
    stats.syntaxInnovations++;
    return state.syntaxOrder;
  }

  function orderedTokens(order, rootToken, modifierToken) {
    return order === 'modifier-referent' ? [modifierToken, rootToken] : [rootToken, modifierToken];
  }

  function emitPhrase(id, organism, state, ph) {
    const pair = inferPair(organism);
    if (!pair || ph.combinatorialCapacity < 0.34 || organism.state === 'sleeping') return null;
    const meaning = meaningForPair(pair);
    const rootToken = meaning ? v54RootToken(organism, meaning) : null;
    if (!meaning || !rootToken) return null;
    associatePrimitive(state, rootToken, pair.referent, 0.72, id);
    state.production[pair.referent] = rootToken;
    const modifierToken = modifierTokenFor(id, state, pair.modifier);
    if (!modifierToken || modifierToken === rootToken) return null;
    const order = ensureSyntax(id, state);
    const tokens = orderedTokens(order, rootToken, modifierToken);
    const strength = clamp(0.30 + ph.combinatorialCapacity * 0.42 + ph.syntaxLearning * 0.20 + clamp(organism.bioV53?.practices?.[meaning]?.strength) * 0.08);
    state.lastPhrase = { tokens:tokens.slice(), pair:{ ...pair }, order, rootToken, modifierToken, step:stepCount };
    stats.phraseEmissions++;
    return { emitterId:id, lineageId:organism.lineageId, tokens, radius:ph.phraseRadius, strength };
  }

  function learnSyntaxFromRootPosition(state, rootIndex, reception) {
    const observedOrder = rootIndex === 0 ? 'referent-modifier' : 'modifier-referent';
    if (!state.syntaxOrder) {
      state.syntaxOrder = observedOrder;
      state.syntaxConfidence = clamp(0.20 + reception * 0.72);
      stats.syntaxCopies++;
      return;
    }
    if (state.syntaxOrder === observedOrder) {
      state.syntaxConfidence = clamp(state.syntaxConfidence * 0.76 + reception * 0.42);
      return;
    }
    if (reception > state.syntaxConfidence + 0.16) {
      state.syntaxOrder = observedOrder;
      state.syntaxConfidence = clamp(reception * 0.72);
      stats.syntaxCopies++;
    } else state.syntaxConfidence *= 0.94;
  }

  function learnByHolophraseReanalysis(receiver, state, emission, reception) {
    const anchor = receiverHolophraseAnchor(receiver, emission.tokens);
    if (!anchor) return false;
    const pair = pairForMeaning(anchor.meaning);
    if (!pair) return false;
    const modifierToken = emission.tokens[anchor.index === 0 ? 1 : 0];
    if (!MODIFIER_TOKENS.includes(modifierToken)) return false;
    associatePrimitive(state, anchor.token, pair.referent, reception, emission.emitterId);
    associatePrimitive(state, modifierToken, pair.modifier, reception, emission.emitterId);
    learnSyntaxFromRootPosition(state, anchor.index, reception);
    stats.holophraseReanalyses++;
    return true;
  }

  function decodeTokens(state, tokens) {
    if (!Array.isArray(tokens) || tokens.length !== 2 || !state.syntaxOrder || state.syntaxConfidence < 0.24) return null;
    const entries = tokens.map(token => state.lexicon[token]);
    if (entries.some(entry => !entry || entry.confidence < 0.34)) return null;
    const first = entries[0].primitive;
    const second = entries[1].primitive;
    let referent;
    let modifier;
    if (state.syntaxOrder === 'referent-modifier') {
      if (!REFERENTS.includes(first) || !MODIFIERS.includes(second)) return null;
      referent = first;
      modifier = second;
    } else if (state.syntaxOrder === 'modifier-referent') {
      if (!MODIFIERS.includes(first) || !REFERENTS.includes(second)) return null;
      modifier = first;
      referent = second;
    } else return null;
    const pair = { referent, modifier };
    return { ...pair, tokens:tokens.slice(), confidence:Math.min(entries[0].confidence, entries[1].confidence, state.syntaxConfidence), novel:!hasObservedPair(state, pair) };
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

  function applyComposition(organism, state, decoded, p, vel, ph) {
    state.appliedComposition = null;
    const target = targetForReferent(organism, decoded.referent);
    if (!target || target.strength < 0.16 || organism.state === 'sleeping') return false;
    if (decoded.modifier === 'avoid') steerAway(vel, p, target, ph.locomotorSpeed * 0.78, 0.81);
    else if (decoded.modifier === 'together') steer(vel, p, target, ph.locomotorSpeed * (0.70 + clamp(organism.genome?.sociality) * 0.16), 0.79);
    else steer(vel, p, target, ph.locomotorSpeed * 0.68, 0.83);
    state.appliedComposition = { referent:decoded.referent, modifier:decoded.modifier };
    stats.compositionalGuidanceEvents++;
    return true;
  }

  function languageStep() {
    const grid = buildGrid();
    const emissions = [];
    let capacitySum = 0;
    let syntaxSum = 0;
    let population = 0;

    for (const [id, organism] of motile.entries()) {
      const p = position.get(id);
      if (!p) continue;
      const ph = phenotype(organism.genome);
      const state = ensureState(organism, ph);
      state.interpretedComposition = null;
      state.appliedComposition = null;
      const emission = emitPhrase(id, organism, state, ph);
      if (emission) emissions.push(emission);
      capacitySum += ph.combinatorialCapacity;
      syntaxSum += ph.syntaxLearning;
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
          const reception = clamp(emission.strength * rph.syntaxLearning * (1 - d / Math.max(1, emission.radius) * 0.45));
          if (reception < 0.17) continue;

          const state = ensureState(receiver, rph);
          state.lastHeardPhrase = { tokens:emission.tokens.slice(), emitterId:emission.emitterId, step:stepCount };
          stats.phraseHearings++;
          if (learnByHolophraseReanalysis(receiver, state, emission, reception)) {
            stats.anchoredPhraseHearings++;
            stats.groundedPhraseHearings++;
          } else {
            stats.unanchoredPhraseHearings++;
            stats.ungroundedPhraseHearings++;
          }

          const decoded = decodeTokens(state, emission.tokens);
          if (!decoded) continue;
          if (decoded.novel) stats.novelCompositions++;
          markObservedPair(state, decoded);
          state.interpretedComposition = { referent:decoded.referent, modifier:decoded.modifier };
          stats.successfulCompositions++;
          applyComposition(receiver, state, decoded, rp, vel, rph);
        }
      }
    }

    const primitiveConventions = new Map();
    const syntaxConventions = new Map();
    const lineages = new Set();
    let activePrimitiveEntries = 0;
    for (const organism of motile.values()) {
      const state = organism.bioV55;
      if (!state) continue;
      const entries = Object.entries(state.lexicon).filter(([, entry]) => entry.confidence >= 0.24);
      activePrimitiveEntries += entries.length;
      if (entries.length >= 2) lineages.add(organism.lineageId);
      for (const [token, entry] of entries) {
        const key = `${organism.lineageId}:${token}:${entry.primitive}`;
        primitiveConventions.set(key, (primitiveConventions.get(key) || 0) + 1);
      }
      if (state.syntaxOrder && state.syntaxConfidence >= 0.24) {
        const key = `${organism.lineageId}:${state.syntaxOrder}`;
        syntaxConventions.set(key, (syntaxConventions.get(key) || 0) + 1);
      }
    }

    stepCount++;
    stats.steps = stepCount;
    stats.activePrimitiveEntries = activePrimitiveEntries;
    stats.sharedPrimitiveConventions = [...primitiveConventions.values()].filter(count => count >= 2).length;
    stats.sharedSyntaxConventions = [...syntaxConventions.values()].filter(count => count >= 2).length;
    stats.compositionalLineages = lineages.size;
    stats.meanCombinatorialCapacity = population ? capacitySum / population : 0;
    stats.meanSyntaxLearning = population ? syntaxSum / population : 0;
  }

  const previousStep = modules.step.bind(modules);
  modules.step = function v55cHolophraseReanalysisStep(dt) {
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
      version:'v55c-known-holophrase-reanalysis',
      independentPrimitiveMeanings:true,
      compositionalGeneralization:true,
      learnedWordOrder:true,
      wordOrderConstrainsDecoding:true,
      syntaxLearnedFromObservedSequence:true,
      holophraseReanalysis:true,
      receiverGroundedPrimitiveLearning:true,
      receiverKnownHolophraseAnchors:true,
      reanalysisWithoutCurrentContext:true,
      rootAnchoredSyntaxLearning:true,
      noSpeakerSemanticMetadata:true,
      retainedCulturalKnowledgeCanBeComposed:true,
      culturallyBlankCompositionalLexiconAtBirth:true,
      nonGeneticCompositionalTransmission:true,
      physicallyLocalTransmission:true,
      kinBiasedTransmission:true,
      boundedPrimitiveLexicon:true,
      maxPrimitiveEntries:maxLexicon,
      primitiveInventory:PRIMITIVES.slice(),
      referentTypes:REFERENTS.slice(),
      modifierTypes:MODIFIERS.slice(),
      modifierTokenInventory:MODIFIER_TOKENS.slice(),
      maxPairSpace:REFERENTS.length * MODIFIERS.length,
      constantPairMemory:true,
      spatialHashing:true,
      authoritativeFixedStep:true,
      noHardPopulationCap:true,
      noHardDisplayCap:true,
      surfaceRendererEnabled:false,
    }),
    getComposition(id) {
      const state = motile.get(id)?.bioV55;
      if (!state) return null;
      return {
        combinatorialCapacity:state.combinatorialCapacity,
        syntaxLearning:state.syntaxLearning,
        lexicon:Object.fromEntries(Object.entries(state.lexicon).map(([token, entry]) => [token, { ...entry }])),
        production:{ ...state.production },
        syntaxOrder:state.syntaxOrder,
        syntaxConfidence:state.syntaxConfidence,
        observedPairMask:state.observedPairMask,
        lastPhrase:state.lastPhrase ? { ...state.lastPhrase, tokens:state.lastPhrase.tokens?.slice(), pair:state.lastPhrase.pair ? { ...state.lastPhrase.pair } : null } : null,
        lastHeardPhrase:state.lastHeardPhrase ? { ...state.lastHeardPhrase, tokens:state.lastHeardPhrase.tokens?.slice() } : null,
        interpretedComposition:state.interpretedComposition ? { ...state.interpretedComposition } : null,
        appliedComposition:state.appliedComposition ? { ...state.appliedComposition } : null,
      };
    },
    getPopulationCompositions() {
      return [...motile.entries()].map(([id, organism]) => ({ id, lineageId:organism.lineageId, generation:organism.generation || 0, composition:api.getComposition(id) })).filter(item => item.composition);
    },
    composeSequence(id, referent, modifier) {
      const state = motile.get(id)?.bioV55;
      if (!state || !REFERENTS.includes(referent) || !MODIFIERS.includes(modifier) || !state.syntaxOrder || state.syntaxConfidence < 0.24) return null;
      const referentToken = bestTokenForPrimitive(state, referent);
      const modifierToken = bestTokenForPrimitive(state, modifier);
      if (!referentToken || !modifierToken || referentToken === modifierToken) return null;
      const tokens = orderedTokens(state.syntaxOrder, referentToken, modifierToken);
      return { referent, modifier, order:state.syntaxOrder, tokens, novel:!hasObservedPair(state, { referent, modifier }) };
    },
    decodeSequence(id, tokens) {
      const state = motile.get(id)?.bioV55;
      return state ? decodeTokens(state, tokens) : null;
    },
  };

  window.realitySandboxCompositionalLanguageV55 = api;
  window.realitySandboxEvolutionBuild = 'evolution-v55-compositional-language';
  document.documentElement.dataset.evolutionBuild = 'evolution-v55-compositional-language';
  document.documentElement.dataset.compositionalLanguageV55 = 'known-holophrase-reanalysis';
}

waitForRuntime().then(install);
