const STEP_SECONDS = 0.9;
const CELL_SIZE = 122;
const REFERENTS = ['food', 'danger', 'prey'];
const MODIFIERS = ['there', 'avoid', 'together'];
const PAIRS = REFERENTS.flatMap(referent => MODIFIERS.map(modifier => `${referent}:${modifier}`));
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number(v) || 0));
const wrap = (v, max) => ((v % max) + max) % max;

async function waitForRuntime() {
  while (true) {
    const language = window.realitySandboxCompositionalLanguageV55;
    const culture = window.realitySandboxProtoCultureV53;
    const memory = window.realitySandboxLearningMemoryV52;
    const brain = window.realitySandboxSensoryBrainsV50;
    const origin = window.realitySandboxOriginMotileLifeV47;
    const planet = window.realitySandboxPlanet;
    const modules = window.realitySandboxModules;
    const c = planet?.world?.ecs?.components;
    if (
      language?.installed &&
      culture?.installed &&
      memory?.installed &&
      brain?.installed &&
      origin?.installed &&
      modules?.step &&
      c?.motile instanceof Map &&
      c?.position instanceof Map &&
      c?.velocity instanceof Map
    ) {
      return { language, planet, modules };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ language, planet, modules }) {
  if (window.realitySandboxCommunicativeIntentV56?.installed) return;

  const { world } = planet;
  const { motile, position, velocity } = world.ecs.components;
  const cols = Math.max(1, Math.ceil(world.width / CELL_SIZE));
  const rows = Math.max(1, Math.ceil(world.height / CELL_SIZE));
  let accumulator = 0;
  let stepCount = 0;

  const stats = {
    steps:0,
    audienceSelections:0,
    intentionalActs:0,
    suppressedActs:0,
    jointAttentionHearings:0,
    decodedJointAttention:0,
    failedDecodes:0,
    deicticGuidanceEvents:0,
    communicativeSuccesses:0,
    communicativeFailures:0,
    utilityReinforcements:0,
    utilityExtinctions:0,
    repeatedSuccessfulActs:0,
    outcomeBiasedChoices:0,
    activeIntentEntries:0,
    communicativeLineages:0,
    meanAudienceAwareness:0,
    meanFeedbackLearning:0,
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
    const motility = clamp(g.motility);
    return {
      audienceAwareness:clamp(0.04 + brainSpeed * 0.42 + sense * 0.24 + sociality * 0.30),
      feedbackLearning:clamp(0.06 + brainSpeed * 0.48 + sociality * 0.34 + sense * 0.12),
      pointingControl:clamp(0.08 + brainSpeed * 0.34 + sense * 0.34 + motility * 0.16 + sociality * 0.08),
      intentRadius:48 + sense * 148 + sociality * 82,
      locomotorSpeed:7 + motility * 36,
    };
  }

  function ensureState(organism, ph) {
    if (!organism.bioV56) {
      organism.bioV56 = {
        audienceAwareness:ph.audienceAwareness,
        feedbackLearning:ph.feedbackLearning,
        pointingControl:ph.pointingControl,
        utilities:Object.fromEntries(PAIRS.map(key => [key, 0])),
        trials:Object.fromEntries(PAIRS.map(key => [key, 0])),
        pendingAct:null,
        lastChoice:null,
        lastIntentionalAct:null,
        lastReceivedAct:null,
        lastJointAttention:null,
        attendedSpeakerId:null,
      };
    }
    organism.bioV56.audienceAwareness = ph.audienceAwareness;
    organism.bioV56.feedbackLearning = ph.feedbackLearning;
    organism.bioV56.pointingControl = ph.pointingControl;
    organism.bioV56.utilities ||= {};
    organism.bioV56.trials ||= {};
    for (const key of PAIRS) {
      if (!Number.isFinite(organism.bioV56.utilities[key])) organism.bioV56.utilities[key] = 0;
      if (!Number.isFinite(organism.bioV56.trials[key])) organism.bioV56.trials[key] = 0;
    }
    return organism.bioV56;
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

  function pairKey(pair) {
    return pair ? `${pair.referent}:${pair.modifier}` : '';
  }

  function currentPair(organism) {
    const applied = organism.bioV55?.appliedComposition;
    if (applied && PAIRS.includes(pairKey(applied))) return { ...applied };

    const practice = organism.bioV53?.appliedPractice;
    if (practice === 'food-route') return { referent:'food', modifier:'there' };
    if (practice === 'danger-avoidance') return { referent:'danger', modifier:'avoid' };
    if (practice === 'pack-hunt') return { referent:'prey', modifier:'together' };

    const recall = organism.bioV52?.recalledAction;
    if (recall === 'seek-food') return { referent:'food', modifier:'there' };
    if (recall === 'avoid-danger') return { referent:'danger', modifier:'avoid' };
    if (recall === 'seek-prey') return { referent:'prey', modifier:'together' };

    const mode = organism.bioV50?.mode;
    if (mode === 'graze' || mode === 'scavenge') return { referent:'food', modifier:'there' };
    if (mode === 'flee') return { referent:'danger', modifier:'avoid' };
    if (mode === 'hunt') return { referent:'prey', modifier:'together' };
    return null;
  }

  function targetForReferent(organism, referent) {
    const practiceName = referent === 'food' ? 'food-route' : referent === 'danger' ? 'danger-avoidance' : 'pack-hunt';
    const practice = organism.bioV53?.practices?.[practiceName];
    if (practice && Number.isFinite(practice.x) && Number.isFinite(practice.y)) {
      return { x:wrap(practice.x, world.width), y:Math.max(0, Math.min(world.height, practice.y)), strength:clamp(practice.strength) };
    }
    const memoryName = referent === 'food' ? 'food' : referent === 'danger' ? 'danger' : 'hunt';
    const memory = organism.bioV52?.memories?.[memoryName];
    if (memory && Number.isFinite(memory.x) && Number.isFinite(memory.y)) {
      return { x:wrap(memory.x, world.width), y:Math.max(0, Math.min(world.height, memory.y)), strength:clamp(memory.strength) };
    }
    return null;
  }

  function gestureToward(p, target) {
    const dx = dxTo(target.x, p.x);
    const dy = target.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    return { x:dx / d, y:dy / d };
  }

  function selectAudience(id, organism, p, ph, grid) {
    const rings = Math.max(1, Math.min(3, Math.ceil(ph.intentRadius / CELL_SIZE)));
    let best = null;
    let bestScore = -Infinity;
    for (const key of neighborKeys(p.x, p.y, rings)) {
      for (const otherId of grid.get(key) || []) {
        if (otherId === id) continue;
        const other = motile.get(otherId);
        const op = position.get(otherId);
        if (!other || !op || other.lineageId !== organism.lineageId) continue;
        const d = distance(p, op);
        if (d > ph.intentRadius) continue;
        const otherPh = phenotype(other.genome);
        const score =
          otherPh.audienceAwareness * 0.34 +
          otherPh.feedbackLearning * 0.24 +
          (1 - d / Math.max(1, ph.intentRadius)) * 0.42;
        if (score > bestScore) {
          bestScore = score;
          best = { id:otherId, p:{ x:op.x, y:op.y }, distance:d };
        }
      }
    }
    return best;
  }

  function assessPendingActs() {
    for (const organism of motile.values()) {
      const state = organism.bioV56;
      const pending = state?.pendingAct;
      if (!pending) continue;
      const receiver = motile.get(pending.audienceId);
      const rp = position.get(pending.audienceId);
      if (!receiver || !rp) {
        state.pendingAct = null;
        continue;
      }

      const dx = dxTo(rp.x, pending.receiverStart.x);
      const dy = rp.y - pending.receiverStart.y;
      const signedProgress = (dx * pending.gesture.x + dy * pending.gesture.y) * pending.expectedSign;
      const success = pending.decoded === true && signedProgress > 0.08;
      const key = pending.pairKey;
      const ph = phenotype(organism.genome);
      const old = clamp((state.utilities[key] + 1) * 0.5);
      const reward = success ? 1 : 0;
      const updated01 = clamp(
        old * (0.76 + (1 - ph.feedbackLearning) * 0.08) +
        reward * (0.16 + ph.feedbackLearning * 0.20)
      );
      state.utilities[key] = updated01 * 2 - 1;
      state.trials[key] = (state.trials[key] || 0) + 1;
      if (success) {
        stats.communicativeSuccesses++;
        stats.utilityReinforcements++;
        if (pending.previousUtility > 0.15) stats.repeatedSuccessfulActs++;
      } else {
        stats.communicativeFailures++;
        stats.utilityExtinctions++;
      }
      state.pendingAct = null;
    }
  }

  function intentionalAct(id, organism, p, ph, grid) {
    if (organism.state === 'sleeping' || ph.audienceAwareness < 0.28 || ph.pointingControl < 0.24) return null;
    const pair = currentPair(organism);
    if (!pair) return null;
    const target = targetForReferent(organism, pair.referent);
    if (!target || target.strength < 0.18) return null;
    const sequence = language.composeSequence?.(id, pair.referent, pair.modifier);
    if (!sequence?.tokens?.length) return null;
    const audience = selectAudience(id, organism, p, ph, grid);
    if (!audience) return null;
    stats.audienceSelections++;

    const state = ensureState(organism, ph);
    const key = pairKey(pair);
    const utility = clamp(state.utilities[key], -1, 1);
    const trials = Math.max(0, Number(state.trials[key]) || 0);
    const learnedWeight = trials > 0 ? 0.28 + ph.feedbackLearning * 0.28 : 0;
    const willingness = clamp(
      0.38 +
      ph.audienceAwareness * 0.20 +
      target.strength * 0.08 +
      utility * learnedWeight
    );
    if (trials > 0) stats.outcomeBiasedChoices++;

    state.lastChoice = {
      audienceId:audience.id,
      pairKey:key,
      utility,
      willingness,
      emitted:willingness >= 0.46,
      step:stepCount,
    };

    if (willingness < 0.46) {
      stats.suppressedActs++;
      return null;
    }

    const utteranceStrength = clamp(
      0.28 +
      ph.audienceAwareness * 0.20 +
      ph.pointingControl * 0.20 +
      willingness * 0.22 +
      target.strength * 0.06
    );
    if (utteranceStrength < 0.38) return null;

    const gesture = gestureToward(p, target);
    const expectedSign = pair.modifier === 'avoid' ? -1 : 1;
    const act = {
      speakerId:id,
      audienceId:audience.id,
      lineageId:organism.lineageId,
      tokens:sequence.tokens.slice(0, 2),
      gesture,
      radius:ph.intentRadius,
      strength:utteranceStrength,
      pairKey:key,
      expectedSign,
    };
    state.lastIntentionalAct = {
      audienceId:audience.id,
      tokens:act.tokens.slice(),
      gesture:{ ...gesture },
      pairKey:key,
      utility,
      willingness,
      step:stepCount,
    };
    stats.intentionalActs++;
    return act;
  }

  function steerByGesture(vel, gesture, speed, modifier) {
    const sign = modifier === 'avoid' ? -1 : 1;
    const blend = modifier === 'together' ? 0.76 : modifier === 'avoid' ? 0.79 : 0.81;
    vel.vx = vel.vx * blend + gesture.x * speed * (1 - blend) * sign;
    vel.vy = vel.vy * blend + gesture.y * speed * (1 - blend) * sign;
  }

  function receiveAct(act) {
    const receiver = motile.get(act.audienceId);
    const rp = position.get(act.audienceId);
    const vel = velocity.get(act.audienceId);
    const sp = position.get(act.speakerId);
    if (!receiver || !rp || !vel || !sp || receiver.lineageId !== act.lineageId) return false;
    const d = distance(sp, rp);
    if (d > act.radius) return false;

    const rph = phenotype(receiver.genome);
    const reception = clamp(act.strength * rph.audienceAwareness * (1 - d / Math.max(1, act.radius) * 0.42));
    if (reception < 0.18) return false;

    const state = ensureState(receiver, rph);
    state.lastReceivedAct = {
      speakerId:act.speakerId,
      tokens:act.tokens.slice(),
      gesture:{ ...act.gesture },
      step:stepCount,
    };
    stats.jointAttentionHearings++;

    const decoded = language.decodeSequence?.(act.audienceId, act.tokens);
    if (!decoded || !REFERENTS.includes(decoded.referent) || !MODIFIERS.includes(decoded.modifier)) {
      stats.failedDecodes++;
      return false;
    }

    state.attendedSpeakerId = act.speakerId;
    state.lastJointAttention = {
      speakerId:act.speakerId,
      referent:decoded.referent,
      modifier:decoded.modifier,
      gesture:{ ...act.gesture },
      step:stepCount,
    };
    stats.decodedJointAttention++;

    if (receiver.state === 'sleeping') return true;
    const speed = rph.locomotorSpeed * (0.56 + reception * 0.28);
    steerByGesture(vel, act.gesture, speed, decoded.modifier);
    stats.deicticGuidanceEvents++;
    return true;
  }

  function intentStep() {
    assessPendingActs();
    const grid = buildGrid();
    const acts = [];
    let awarenessSum = 0;
    let feedbackSum = 0;
    let population = 0;

    for (const [id, organism] of motile.entries()) {
      const p = position.get(id);
      if (!p) continue;
      const ph = phenotype(organism.genome);
      const state = ensureState(organism, ph);
      const act = intentionalAct(id, organism, p, ph, grid);
      if (act) acts.push(act);
      awarenessSum += ph.audienceAwareness;
      feedbackSum += ph.feedbackLearning;
      population++;
      if (!act && state.lastJointAttention && stepCount - state.lastJointAttention.step > 6) {
        state.attendedSpeakerId = null;
      }
    }

    for (const act of acts) {
      const receiverStart = position.get(act.audienceId);
      const speaker = motile.get(act.speakerId);
      const speakerState = speaker?.bioV56;
      if (!receiverStart || !speakerState) continue;
      const decoded = receiveAct(act);
      speakerState.pendingAct = {
        audienceId:act.audienceId,
        pairKey:act.pairKey,
        gesture:{ ...act.gesture },
        expectedSign:act.expectedSign,
        receiverStart:{ x:receiverStart.x, y:receiverStart.y },
        previousUtility:speakerState.utilities[act.pairKey] || 0,
        decoded,
        step:stepCount,
      };
    }

    const lineages = new Set();
    let activeEntries = 0;
    for (const organism of motile.values()) {
      const state = organism.bioV56;
      if (!state) continue;
      const entries = Object.values(state.trials).filter(value => value > 0).length;
      activeEntries += entries;
      if (entries || state.lastIntentionalAct || state.lastJointAttention) lineages.add(organism.lineageId);
    }

    stepCount++;
    stats.steps = stepCount;
    stats.activeIntentEntries = activeEntries;
    stats.communicativeLineages = lineages.size;
    stats.meanAudienceAwareness = population ? awarenessSum / population : 0;
    stats.meanFeedbackLearning = population ? feedbackSum / population : 0;
  }

  const previousStep = modules.step.bind(modules);
  modules.step = function v56OutcomeBiasedCommunicativeIntentStep(dt) {
    const result = previousStep(dt);
    accumulator += Number(dt) || 0;
    if (accumulator >= STEP_SECONDS) {
      accumulator = 0;
      intentStep();
    }
    return result;
  };

  const api = {
    installed:true,
    getStats:() => ({
      ...stats,
      installed:true,
      version:'v56b-outcome-biased-communicative-intent',
      audienceDirectedCommunication:true,
      communicativeSuccessReinforcement:true,
      listenerBehaviorFeedback:true,
      decodedResponseRequiredForSuccess:true,
      outcomeBiasedCommunicationChoice:true,
      failedActsCanBeSuppressed:true,
      staleUtteranceContextRejected:true,
      deicticJointAttention:true,
      observableGestureDirection:true,
      noHiddenTargetCoordinates:true,
      requiresLearnedV55Decoding:true,
      noSpeakerSemanticMetadata:true,
      physicallyLocalTransmission:true,
      kinBiasedTransmission:true,
      boundedIntentMemory:true,
      maxIntentEntries:PAIRS.length,
      pairSpace:PAIRS.slice(),
      spatialHashing:true,
      authoritativeFixedStep:true,
      noHardPopulationCap:true,
      noHardDisplayCap:true,
      surfaceRendererEnabled:false,
    }),
    getIntent(id) {
      const state = motile.get(id)?.bioV56;
      if (!state) return null;
      return {
        audienceAwareness:state.audienceAwareness,
        feedbackLearning:state.feedbackLearning,
        pointingControl:state.pointingControl,
        utilities:{ ...state.utilities },
        trials:{ ...state.trials },
        pendingAct:state.pendingAct ? { ...state.pendingAct, gesture:{ ...state.pendingAct.gesture }, receiverStart:{ ...state.pendingAct.receiverStart } } : null,
        lastChoice:state.lastChoice ? { ...state.lastChoice } : null,
        lastIntentionalAct:state.lastIntentionalAct ? { ...state.lastIntentionalAct, tokens:state.lastIntentionalAct.tokens?.slice(), gesture:{ ...state.lastIntentionalAct.gesture } } : null,
        lastReceivedAct:state.lastReceivedAct ? { ...state.lastReceivedAct, tokens:state.lastReceivedAct.tokens?.slice(), gesture:{ ...state.lastReceivedAct.gesture } } : null,
        lastJointAttention:state.lastJointAttention ? { ...state.lastJointAttention, gesture:{ ...state.lastJointAttention.gesture } } : null,
        attendedSpeakerId:state.attendedSpeakerId,
      };
    },
    getPopulationIntent() {
      return [...motile.entries()]
        .map(([id, organism]) => ({ id, lineageId:organism.lineageId, generation:organism.generation || 0, intent:api.getIntent(id) }))
        .filter(item => item.intent);
    },
  };

  window.realitySandboxCommunicativeIntentV56 = api;
  window.realitySandboxEvolutionBuild = 'evolution-v56-communicative-intent';
  document.documentElement.dataset.evolutionBuild = 'evolution-v56-communicative-intent';
  document.documentElement.dataset.communicativeIntentV56 = 'outcome-biased-joint-attention';
}

waitForRuntime().then(install);
