const STEP_SECONDS = 0.9;
const CELL_SIZE = 124;
const MAX_PARTNERS = 8;
const MAX_SPEAKER_EVIDENCE_AGE = 4;
const REFERENTS = ['food', 'danger', 'prey'];
const PAIRS = [
  'food:there','food:avoid','food:together',
  'danger:there','danger:avoid','danger:together',
  'prey:there','prey:avoid','prey:together',
];
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number(v) || 0));
const clampSigned = v => Math.max(-1, Math.min(1, Number(v) || 0));
const wrap = (v, max) => ((v % max) + max) % max;

async function waitForRuntime() {
  while (true) {
    const intent = window.realitySandboxCommunicativeIntentV56;
    const composition = window.realitySandboxCompositionalLanguageV55;
    const brain = window.realitySandboxSensoryBrainsV50;
    const origin = window.realitySandboxOriginMotileLifeV47;
    const planet = window.realitySandboxPlanet;
    const modules = window.realitySandboxModules;
    const c = planet?.world?.ecs?.components;
    if (
      intent?.installed && composition?.installed && brain?.installed && origin?.installed &&
      modules?.step && c?.motile instanceof Map && c?.position instanceof Map && c?.velocity instanceof Map
    ) return { intent, planet, modules };
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ intent, planet, modules }) {
  if (window.realitySandboxSocialModelsV57?.installed) return;

  const { world } = planet;
  const { motile, position, velocity } = world.ecs.components;
  const cols = Math.max(1, Math.ceil(world.width / CELL_SIZE));
  const rows = Math.max(1, Math.ceil(world.height / CELL_SIZE));
  let accumulator = 0;
  let stepCount = 0;

  const stats = {
    steps:0,
    partnerObservations:0,
    decodedPartnerObservations:0,
    outgoingOutcomeUpdates:0,
    responsivenessReinforcements:0,
    responsivenessExtinctions:0,
    speakerOutcomeChecks:0,
    speakerTrustReinforcements:0,
    speakerTrustExtinctions:0,
    unresolvedSpeakerEvidence:0,
    knowledgeAttributions:0,
    knowledgeCorrections:0,
    partnerEvictions:0,
    preferredPartnerChanges:0,
    selectiveAttentionEvents:0,
    sociallyBiasedAudienceScores:0,
    socialGuidanceEvents:0,
    activePartnerModels:0,
    modeledOrganisms:0,
    socialModelLineages:0,
    meanSocialInference:0,
    meanPartnerMemory:0,
  };

  function dxTo(targetX, originX) {
    let d = targetX - originX;
    if (d > world.width * 0.5) d -= world.width;
    else if (d < -world.width * 0.5) d += world.width;
    return d;
  }

  function distance(a, b) {
    return Math.hypot(dxTo(b.x, a.x), b.y - a.y);
  }

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

  function phenotype(g = {}) {
    const brainSpeed = clamp(g.brainSpeed);
    const sociality = clamp(g.sociality);
    const sense = clamp(g.sense);
    const motility = clamp(g.motility);
    return {
      socialInference:clamp(0.04 + brainSpeed * 0.48 + sociality * 0.30 + sense * 0.18),
      partnerMemory:clamp(0.08 + brainSpeed * 0.42 + sociality * 0.24 + sense * 0.18),
      attentionSelectivity:clamp(0.04 + brainSpeed * 0.34 + sociality * 0.40 + sense * 0.18),
      socialRadius:64 + sense * 132 + sociality * 92,
      locomotorSpeed:7 + motility * 36,
    };
  }

  function newPartnerModel(id) {
    return {
      id,
      trust:0,
      responsiveness:0,
      familiarity:0,
      knowledge:{ food:0, danger:0, prey:0 },
      observations:0,
      successfulResponses:0,
      failedResponses:0,
      reliableClaims:0,
      unreliableClaims:0,
      lastSeenStep:stepCount,
      lastInteractionStep:stepCount,
    };
  }

  function ensureState(organism, ph) {
    if (!organism.bioV57) {
      organism.bioV57 = {
        socialInference:ph.socialInference,
        partnerMemory:ph.partnerMemory,
        attentionSelectivity:ph.attentionSelectivity,
        models:{},
        preferredPartnerId:null,
        preferredPartnerScore:0,
        lastReceivedStep:-1,
        lastCapturedActStep:-1,
        pendingAudienceEvidence:null,
        pendingSpeakerEvidence:null,
        lastSocialGuidance:null,
      };
    }
    organism.bioV57.socialInference = ph.socialInference;
    organism.bioV57.partnerMemory = ph.partnerMemory;
    organism.bioV57.attentionSelectivity = ph.attentionSelectivity;
    organism.bioV57.models ||= {};
    return organism.bioV57;
  }

  function modelScoreForRetention(model) {
    const knowledge = Math.max(...Object.values(model.knowledge || {}).map(clamp));
    const evidence = Math.min(1, (
      (model.successfulResponses || 0) + (model.failedResponses || 0) +
      (model.reliableClaims || 0) + (model.unreliableClaims || 0)
    ) / 6);
    const recencyPenalty = clamp((stepCount - model.lastInteractionStep) / 240) * 0.10;
    return (
      model.familiarity * 0.34 +
      Math.abs(model.trust) * 0.18 +
      Math.abs(model.responsiveness) * 0.20 +
      knowledge * 0.12 +
      evidence * 0.16 -
      recencyPenalty
    );
  }

  function ensurePartner(state, partnerId) {
    const key = String(partnerId);
    if (state.models[key]) return state.models[key];

    const keys = Object.keys(state.models);
    if (keys.length >= MAX_PARTNERS) {
      let weakestKey = null;
      let weakestScore = Infinity;
      for (const existingKey of keys) {
        const score = modelScoreForRetention(state.models[existingKey]);
        if (score < weakestScore) {
          weakestScore = score;
          weakestKey = existingKey;
        }
      }
      if (weakestKey != null) {
        delete state.models[weakestKey];
        stats.partnerEvictions++;
      }
    }

    const model = newPartnerModel(partnerId);
    state.models[key] = model;
    return model;
  }

  function decayModels(state, ph) {
    const signedRetain = 0.992 + ph.partnerMemory * 0.0075;
    const familiarityRetain = 0.997 + ph.partnerMemory * 0.0025;
    const knowledgeRetain = 0.994 + ph.partnerMemory * 0.0055;
    for (const model of Object.values(state.models)) {
      model.trust = clampSigned(model.trust * signedRetain);
      model.responsiveness = clampSigned(model.responsiveness * signedRetain);
      model.familiarity = clamp(model.familiarity * familiarityRetain);
      for (const referent of REFERENTS) {
        model.knowledge[referent] = clamp(model.knowledge[referent] * knowledgeRetain);
      }
    }
  }

  function ownEvidenceSnapshot(organism) {
    const b50 = organism.bioV50 || {};
    const b52 = organism.bioV52 || {};
    return {
      energy:Number(organism.energy) || 0,
      danger:Boolean(b50.detectedDanger),
      foodCue:Boolean(b50.targetPlant || b50.targetDetritus),
      preyCue:Boolean(b50.detectedPrey),
      foodMemoryStep:Number(b52.memories?.food?.updatedAtStep) || -1,
      dangerMemoryStep:Number(b52.memories?.danger?.updatedAtStep) || -1,
      huntMemoryStep:Number(b52.memories?.hunt?.updatedAtStep) || -1,
    };
  }

  function observedReferentEvidence(organism, pending) {
    const now = ownEvidenceSnapshot(organism);
    const baseline = pending.baseline;
    if (pending.referent === 'food') {
      const supported =
        now.energy > baseline.energy + 0.006 ||
        now.foodCue ||
        now.foodMemoryStep > baseline.foodMemoryStep;
      return { supported, contradicted:false };
    }

    if (pending.referent === 'prey') {
      const supported = now.preyCue || now.huntMemoryStep > baseline.huntMemoryStep;
      return { supported, contradicted:false };
    }

    if (pending.referent === 'danger') {
      if (pending.modifier === 'avoid') {
        const supported = baseline.danger && !now.danger;
        const contradicted = baseline.danger && now.danger;
        return { supported, contradicted };
      }
      const supported = now.danger || now.dangerMemoryStep > baseline.dangerMemoryStep;
      return { supported, contradicted:false };
    }

    return { supported:false, contradicted:false };
  }

  function updateSpeakerReliability(model, ph, referent, success) {
    const alpha = 0.14 + ph.socialInference * 0.30;
    const reward = success ? 1 : -1;
    model.trust = clampSigned(model.trust * (1 - alpha) + reward * alpha);
    if (success) {
      model.reliableClaims++;
      model.knowledge[referent] = clamp(model.knowledge[referent] + (0.10 + ph.socialInference * 0.24) * (1 - model.knowledge[referent]));
      stats.speakerTrustReinforcements++;
      stats.knowledgeAttributions++;
    } else {
      model.unreliableClaims++;
      model.knowledge[referent] = clamp(model.knowledge[referent] * (0.78 - ph.socialInference * 0.12));
      stats.speakerTrustExtinctions++;
      stats.knowledgeCorrections++;
    }
    model.lastInteractionStep = stepCount;
    stats.speakerOutcomeChecks++;
  }

  function assessSpeakerEvidence(id, organism, state, ph) {
    const pending = state.pendingSpeakerEvidence;
    if (!pending) return;
    const p = position.get(id);
    if (!p) {
      state.pendingSpeakerEvidence = null;
      return;
    }

    const dx = dxTo(p.x, pending.start.x);
    const dy = p.y - pending.start.y;
    const sign = pending.modifier === 'avoid' ? -1 : 1;
    const signedProgress = (dx * pending.gesture.x + dy * pending.gesture.y) * sign;
    const followed = signedProgress > 0.08;
    const age = stepCount - pending.capturedAtStep;
    const observed = observedReferentEvidence(organism, pending);

    let verdict = null;
    if (observed.supported) verdict = true;
    else if (followed && observed.contradicted) verdict = false;
    else if (followed && age >= MAX_SPEAKER_EVIDENCE_AGE) verdict = false;

    if (verdict == null) {
      if (age > MAX_SPEAKER_EVIDENCE_AGE + 2) {
        stats.unresolvedSpeakerEvidence++;
        state.pendingSpeakerEvidence = null;
      }
      return;
    }

    const model = ensurePartner(state, pending.speakerId);
    updateSpeakerReliability(model, ph, pending.referent, verdict);
    state.pendingSpeakerEvidence = null;
  }

  function observeIncoming(id, organism, state, ph) {
    const v56 = organism.bioV56;
    const received = v56?.lastReceivedAct;
    if (!received || !Number.isFinite(received.step) || received.step <= state.lastReceivedStep) return;
    state.lastReceivedStep = received.step;

    const speakerId = received.speakerId;
    if (speakerId == null) return;
    const model = ensurePartner(state, speakerId);
    model.observations++;
    model.familiarity = clamp(model.familiarity + 0.08 + ph.socialInference * 0.05);
    model.lastSeenStep = stepCount;
    model.lastInteractionStep = stepCount;
    stats.partnerObservations++;

    const joint = v56?.lastJointAttention;
    if (
      joint &&
      joint.speakerId === speakerId &&
      Number.isFinite(joint.step) &&
      joint.step === received.step &&
      REFERENTS.includes(joint.referent)
    ) {
      const p = position.get(id);
      if (!p) return;
      stats.decodedPartnerObservations++;
      state.pendingSpeakerEvidence = {
        speakerId,
        referent:joint.referent,
        modifier:joint.modifier,
        gesture:{ ...joint.gesture },
        receivedStep:joint.step,
        capturedAtStep:stepCount,
        start:{ x:p.x, y:p.y },
        baseline:ownEvidenceSnapshot(organism),
      };
    }
  }

  function assessOutgoingOutcome(organism, state, ph) {
    const pending = state.pendingAudienceEvidence;
    if (!pending) return;
    const v56 = organism.bioV56;
    const key = pending.pairKey;
    if (!PAIRS.includes(key)) {
      state.pendingAudienceEvidence = null;
      return;
    }

    const currentTrials = Number(v56?.trials?.[key]) || 0;
    if (currentTrials <= pending.trialBefore) return;

    const currentUtility = clampSigned(v56?.utilities?.[key]);
    const success = currentUtility > pending.utilityBefore + 0.015;
    const model = ensurePartner(state, pending.audienceId);
    const alpha = 0.18 + ph.socialInference * 0.28;
    model.responsiveness = clampSigned(
      model.responsiveness * (1 - alpha) +
      (success ? 1 : -1) * alpha
    );
    model.familiarity = clamp(model.familiarity + 0.10);
    model.lastInteractionStep = stepCount;
    if (success) {
      model.successfulResponses++;
      stats.responsivenessReinforcements++;
    } else {
      model.failedResponses++;
      stats.responsivenessExtinctions++;
    }
    stats.outgoingOutcomeUpdates++;
    state.pendingAudienceEvidence = null;
  }

  function captureOutgoingAct(organism, state) {
    const v56 = organism.bioV56;
    const act = v56?.lastIntentionalAct;
    if (
      !act ||
      !Number.isFinite(act.step) ||
      act.step <= state.lastCapturedActStep ||
      act.audienceId == null ||
      !PAIRS.includes(act.pairKey)
    ) return;

    state.lastCapturedActStep = act.step;
    state.pendingAudienceEvidence = {
      audienceId:act.audienceId,
      pairKey:act.pairKey,
      trialBefore:Number(v56.trials?.[act.pairKey]) || 0,
      utilityBefore:clampSigned(v56.utilities?.[act.pairKey]),
      capturedAtStep:stepCount,
    };
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

  function partnerAttentionScore(model, d, radius, ph) {
    const knowledge = Math.max(...Object.values(model.knowledge || {}).map(clamp));
    const distanceTerm = 1 - clamp(d / Math.max(1, radius));
    return (
      model.responsiveness * 0.30 +
      model.trust * 0.22 +
      knowledge * 0.14 +
      model.familiarity * 0.12 +
      distanceTerm * 0.22
    ) * (0.55 + ph.attentionSelectivity * 0.45);
  }

  function choosePreferredPartner(id, organism, state, ph, p, grid) {
    const previous = state.preferredPartnerId;
    let bestId = null;
    let bestScore = -Infinity;
    const rings = Math.max(1, Math.min(3, Math.ceil(ph.socialRadius / CELL_SIZE)));

    for (const key of neighborKeys(p.x, p.y, rings)) {
      for (const otherId of grid.get(key) || []) {
        if (otherId === id) continue;
        const other = motile.get(otherId);
        const op = position.get(otherId);
        if (!other || !op || other.lineageId !== organism.lineageId) continue;
        const model = state.models[String(otherId)];
        if (!model || model.observations < 1) continue;
        const d = distance(p, op);
        if (d > ph.socialRadius) continue;
        model.lastSeenStep = stepCount;
        const score = partnerAttentionScore(model, d, ph.socialRadius, ph);
        if (score > bestScore) {
          bestScore = score;
          bestId = otherId;
        }
      }
    }

    state.preferredPartnerId = bestId;
    state.preferredPartnerScore = Number.isFinite(bestScore) ? bestScore : 0;
    if (bestId !== previous) stats.preferredPartnerChanges++;
    if (bestId != null) stats.selectiveAttentionEvents++;
  }

  function steerToward(vel, p, target, speed, blend) {
    const dx = dxTo(target.x, p.x);
    const dy = target.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    vel.vx = vel.vx * blend + (dx / d) * speed * (1 - blend);
    vel.vy = vel.vy * blend + (dy / d) * speed * (1 - blend);
  }

  function applySelectiveSocialGuidance(id, organism, state, ph, p, vel) {
    state.lastSocialGuidance = null;
    const partnerId = state.preferredPartnerId;
    if (
      partnerId == null ||
      state.preferredPartnerScore < 0.10 ||
      organism.state === 'sleeping'
    ) return;

    const target = position.get(partnerId);
    if (!target) return;

    const mode = organism.bioV50?.mode;
    const hasUrgentTarget = Boolean(
      organism.bioV50?.detectedDanger ||
      organism.bioV50?.detectedPrey ||
      organism.bioV50?.targetPlant ||
      organism.bioV50?.targetDetritus ||
      state.pendingSpeakerEvidence
    );
    if (hasUrgentTarget || (mode !== 'explore' && mode !== 'flock' && mode !== 'rest')) return;

    const blend = 0.90 - ph.attentionSelectivity * 0.08;
    steerToward(vel, p, target, ph.locomotorSpeed * 0.46, blend);
    state.lastSocialGuidance = {
      partnerId,
      score:state.preferredPartnerScore,
      step:stepCount,
    };
    stats.socialGuidanceEvents++;
  }

  function scoreAudience(observerId, partnerId, baseScore) {
    const observer = motile.get(observerId);
    const state = observer?.bioV57;
    const model = state?.models?.[String(partnerId)];
    if (!model) return baseScore;

    const responseTrials = (model.successfulResponses || 0) + (model.failedResponses || 0);
    if (!responseTrials) return baseScore;

    const evidenceStrength = clamp(responseTrials / 4);
    const adjustment = (
      model.responsiveness * (0.34 + evidenceStrength * 0.18) +
      model.familiarity * 0.04
    ) * (0.50 + clamp(state.attentionSelectivity) * 0.50);

    stats.sociallyBiasedAudienceScores++;
    return Number(baseScore) + adjustment;
  }

  function socialModelStep() {
    const grid = buildGrid();
    let inferenceSum = 0;
    let memorySum = 0;
    let population = 0;

    for (const [id, organism] of motile.entries()) {
      const p = position.get(id);
      const vel = velocity.get(id);
      if (!p || !vel) continue;
      const ph = phenotype(organism.genome);
      const state = ensureState(organism, ph);

      decayModels(state, ph);
      assessOutgoingOutcome(organism, state, ph);
      assessSpeakerEvidence(id, organism, state, ph);
      observeIncoming(id, organism, state, ph);
      captureOutgoingAct(organism, state);
      choosePreferredPartner(id, organism, state, ph, p, grid);
      applySelectiveSocialGuidance(id, organism, state, ph, p, vel);

      inferenceSum += ph.socialInference;
      memorySum += ph.partnerMemory;
      population++;
    }

    let active = 0;
    const modeled = new Set();
    const lineages = new Set();
    for (const organism of motile.values()) {
      const models = Object.values(organism.bioV57?.models || {});
      active += models.length;
      if (models.length) lineages.add(organism.lineageId);
      for (const model of models) modeled.add(model.id);
    }

    stepCount++;
    stats.steps = stepCount;
    stats.activePartnerModels = active;
    stats.modeledOrganisms = modeled.size;
    stats.socialModelLineages = lineages.size;
    stats.meanSocialInference = population ? inferenceSum / population : 0;
    stats.meanPartnerMemory = population ? memorySum / population : 0;
  }

  const previousStep = modules.step.bind(modules);
  modules.step = function v57SocialModelStep(dt) {
    const result = previousStep(dt);
    accumulator += Number(dt) || 0;
    if (accumulator >= STEP_SECONDS) {
      accumulator = 0;
      socialModelStep();
    }
    return result;
  };

  const api = {
    installed:true,
    scoreAudience,
    getStats:() => ({
      ...stats,
      installed:true,
      version:'v57b-observed-outcome-social-models',
      individualPartnerModels:true,
      evidenceFromOwnInteractionsOnly:true,
      noPrivateStateInspection:true,
      learnedPartnerResponsiveness:true,
      speakerReliabilityFromOwnConsequences:true,
      inferredPartnerKnowledgeRequiresObservedOutcome:true,
      trustNotGrantedByDecodeAlone:true,
      socialModelsBiasAudienceSelection:true,
      selectiveSocialAttention:true,
      socialModelsAffectBehavior:true,
      boundedPartnerModels:true,
      maxPartnerModels:MAX_PARTNERS,
      partnerKnowledgeDimensions:REFERENTS.slice(),
      spatialHashing:true,
      authoritativeFixedStep:true,
      noHardPopulationCap:true,
      noHardDisplayCap:true,
      surfaceRendererEnabled:false,
    }),
    getSocialModel(id) {
      const state = motile.get(id)?.bioV57;
      if (!state) return null;
      return {
        socialInference:state.socialInference,
        partnerMemory:state.partnerMemory,
        attentionSelectivity:state.attentionSelectivity,
        preferredPartnerId:state.preferredPartnerId,
        preferredPartnerScore:state.preferredPartnerScore,
        pendingAudienceEvidence:state.pendingAudienceEvidence ? { ...state.pendingAudienceEvidence } : null,
        pendingSpeakerEvidence:state.pendingSpeakerEvidence ? {
          ...state.pendingSpeakerEvidence,
          gesture:{ ...state.pendingSpeakerEvidence.gesture },
          start:{ ...state.pendingSpeakerEvidence.start },
          baseline:{ ...state.pendingSpeakerEvidence.baseline },
        } : null,
        lastSocialGuidance:state.lastSocialGuidance ? { ...state.lastSocialGuidance } : null,
        models:Object.fromEntries(Object.entries(state.models).map(([key, model]) => [key, {
          ...model,
          knowledge:{ ...model.knowledge },
        }])),
      };
    },
    getPopulationSocialModels() {
      return [...motile.entries()]
        .map(([id, organism]) => ({
          id,
          lineageId:organism.lineageId,
          generation:organism.generation || 0,
          socialModel:api.getSocialModel(id),
        }))
        .filter(item => item.socialModel);
    },
  };

  window.realitySandboxSocialModelsV57 = api;
  window.realitySandboxEvolutionBuild = 'evolution-v57-social-models';
  document.documentElement.dataset.evolutionBuild = 'evolution-v57-social-models';
  document.documentElement.dataset.socialModelsV57 = 'observed-outcome-partners';
}

waitForRuntime().then(install);
