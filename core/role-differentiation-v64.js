const STEP_SECONDS = 0.9;
const MIN_ROLE_EVIDENCE = 2;
const ROLE_BIAS_THRESHOLD = 0.22;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number(v) || 0));
const clampSigned = v => Math.max(-1, Math.min(1, Number(v) || 0));

async function waitForRuntime() {
  while (true) {
    const intent = window.realitySandboxCommunicativeIntentV56;
    const social = window.realitySandboxSocialModelsV57;
    const jointAction = window.realitySandboxCoalitionJointActionV63;
    const planet = window.realitySandboxPlanet;
    const modules = window.realitySandboxModules;
    const motile = planet?.world?.ecs?.components?.motile;
    if (
      intent?.installed && social?.installed && jointAction?.installed &&
      typeof social.scoreAudience === 'function' &&
      typeof jointAction.setCommitmentModifier === 'function' &&
      modules?.step && motile instanceof Map
    ) return { intent, social, jointAction, planet, modules };
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ intent, social, jointAction, planet, modules }) {
  if (window.realitySandboxRoleDifferentiationV64?.installed) return;

  const { motile } = planet.world.ecs.components;
  const nativeScoreAudience = social.scoreAudience.bind(social);
  let accumulator = 0;
  let stepCount = 0;

  const stats = {
    steps:0,
    roleUpdates:0,
    initiativeEvidenceEvents:0,
    responseEvidenceEvents:0,
    complementarityScoreAdjustments:0,
    responderCommitmentAdjustments:0,
    differentiatedOrganisms:0,
    initiativeLeaningOrganisms:0,
    responseLeaningOrganisms:0,
    roleBearingLineages:0,
    meanInitiativeTendency:0,
    meanAbsoluteDifferentiation:0,
    meanRoleLearning:0,
  };

  function phenotype(g = {}) {
    const brain = clamp(g.brainSpeed);
    const sociality = clamp(g.sociality);
    const sense = clamp(g.sense);
    return {
      roleLearning:clamp(0.08 + brain * 0.36 + sociality * 0.30 + sense * 0.14),
      complementaritySensitivity:clamp(0.08 + brain * 0.28 + sociality * 0.34 + sense * 0.16),
      persistencePlasticity:clamp(0.06 + brain * 0.30 + sociality * 0.34 + sense * 0.14),
    };
  }

  function ensureState(organism, ph) {
    if (!organism.bioV64) {
      organism.bioV64 = {
        roleLearning:ph.roleLearning,
        complementaritySensitivity:ph.complementaritySensitivity,
        persistencePlasticity:ph.persistencePlasticity,
        initiativeTendency:0,
        roleEvidence:0,
        initiations:0,
        responses:0,
        lastInitiationKey:null,
        lastResponseKey:null,
        lastRoleUpdate:null,
        lastComplementarityAdjustment:null,
        lastCommitmentAdjustment:null,
      };
    }
    const state = organism.bioV64;
    state.roleLearning = ph.roleLearning;
    state.complementaritySensitivity = ph.complementaritySensitivity;
    state.persistencePlasticity = ph.persistencePlasticity;
    return state;
  }

  function learnRole(state, ph, signal, source, partnerId, evidenceKey) {
    const alpha = 0.12 + ph.roleLearning * 0.24;
    state.initiativeTendency = clampSigned(
      state.initiativeTendency * (1 - alpha) + signal * alpha
    );
    state.roleEvidence++;
    if (signal > 0) {
      state.initiations++;
      stats.initiativeEvidenceEvents++;
    } else {
      state.responses++;
      stats.responseEvidenceEvents++;
    }
    state.lastRoleUpdate = {
      source,
      partnerId,
      signal,
      evidenceKey,
      initiativeTendency:state.initiativeTendency,
      roleEvidence:state.roleEvidence,
      step:stepCount,
    };
    stats.roleUpdates++;
  }

  function observeInitiation(id, organism, state, ph) {
    const act = intent.getIntent?.(id)?.lastIntentionalAct || null;
    if (!act || !Number.isFinite(act.step) || act.audienceId == null) return;
    const key = `${act.step}:${act.audienceId}:${act.pairKey || ''}`;
    if (state.lastInitiationKey === key) return;
    state.lastInitiationKey = key;
    learnRole(state, ph, 1, 'own-v56-initiation', act.audienceId, key);
  }

  function observeResponse(id, organism, state, ph) {
    const joint = jointAction.getJointAction?.(id) || null;
    const applied = joint?.lastAppliedCommitment;
    if (
      !applied || applied.interrupted || applied.speakerId == null ||
      !Number.isFinite(applied.sourceJointAttentionStep)
    ) return;
    const key = `${applied.speakerId}:${applied.sourceJointAttentionStep}`;
    if (state.lastResponseKey === key) return;
    state.lastResponseKey = key;
    learnRole(state, ph, -1, 'own-v63-response', applied.speakerId, key);
  }

  function evidenceWeight(state) {
    return clamp(state.roleEvidence / 4);
  }

  function initiativeSpecialization(state) {
    if (!state || state.roleEvidence < MIN_ROLE_EVIDENCE) return 0;
    return clamp((state.initiativeTendency - ROLE_BIAS_THRESHOLD) / (1 - ROLE_BIAS_THRESHOLD)) * evidenceWeight(state);
  }

  function responseSpecialization(state) {
    if (!state || state.roleEvidence < MIN_ROLE_EVIDENCE) return 0;
    return clamp((-state.initiativeTendency - ROLE_BIAS_THRESHOLD) / (1 - ROLE_BIAS_THRESHOLD)) * evidenceWeight(state);
  }

  function complementarityAdjustment(observerId, partnerId) {
    const observer = motile.get(observerId);
    if (!observer) return { adjustment:0, reason:'missing-observer' };
    const ph = phenotype(observer.genome);
    const state = ensureState(observer, ph);
    const specialization = initiativeSpecialization(state);
    if (specialization <= 0) return { adjustment:0, reason:'no-initiative-specialization' };

    const ownModel = social.getSocialModel?.(observerId)?.models?.[String(partnerId)] || null;
    const trials = (ownModel?.successfulResponses || 0) + (ownModel?.failedResponses || 0);
    if (!ownModel || trials < 1) return { adjustment:0, reason:'no-own-response-history' };

    const responseEvidence = clamp(trials / 4);
    const knownResponsiveness = clampSigned(ownModel.responsiveness);
    const adjustment = clampSigned(
      specialization * responseEvidence * knownResponsiveness *
      (0.06 + ph.complementaritySensitivity * 0.06)
    );
    return {
      adjustment,
      specialization,
      responseEvidence,
      knownResponsiveness,
      trials,
    };
  }

  social.scoreAudience = function v64ComplementaryAudienceScore(observerId, partnerId, baseScore, ...rest) {
    const inherited = nativeScoreAudience(observerId, partnerId, baseScore, ...rest);
    const result = complementarityAdjustment(observerId, partnerId);
    const observer = motile.get(observerId);
    const state = observer?.bioV64;
    if (state) {
      state.lastComplementarityAdjustment = {
        partnerId,
        baseScore:Number(baseScore) || 0,
        inheritedScore:Number(inherited) || 0,
        adjustment:result.adjustment,
        finalScore:(Number(inherited) || 0) + result.adjustment,
        specialization:result.specialization || 0,
        knownResponsiveness:result.knownResponsiveness || 0,
        responseEvidence:result.responseEvidence || 0,
        step:stepCount,
      };
    }
    if (Math.abs(result.adjustment) > 1e-12) stats.complementarityScoreAdjustments++;
    return (Number(inherited) || 0) + result.adjustment;
  };

  jointAction.setCommitmentModifier(({ organismId, baseDuration, baseStrength }) => {
    const organism = motile.get(organismId);
    if (!organism) return null;
    const ph = phenotype(organism.genome);
    const state = ensureState(organism, ph);
    const specialization = responseSpecialization(state);
    if (specialization <= 0) {
      state.lastCommitmentAdjustment = null;
      return null;
    }

    const durationAdjustment = specialization > 0.58 ? 2 : 1;
    const strengthAdjustment = specialization * (0.04 + ph.persistencePlasticity * 0.05);
    state.lastCommitmentAdjustment = {
      baseDuration,
      baseStrength,
      durationAdjustment,
      strengthAdjustment,
      specialization,
      step:stepCount,
    };
    stats.responderCommitmentAdjustments++;
    return { durationAdjustment, strengthAdjustment };
  });

  function roleStep() {
    let tendencySum = 0;
    let absoluteSum = 0;
    let learningSum = 0;
    let population = 0;
    let differentiated = 0;
    let initiativeLeaning = 0;
    let responseLeaning = 0;
    const lineages = new Set();

    for (const [id, organism] of motile.entries()) {
      const ph = phenotype(organism.genome);
      const state = ensureState(organism, ph);
      observeInitiation(id, organism, state, ph);
      observeResponse(id, organism, state, ph);

      const abs = Math.abs(state.initiativeTendency);
      if (state.roleEvidence >= MIN_ROLE_EVIDENCE && abs >= ROLE_BIAS_THRESHOLD) {
        differentiated++;
        lineages.add(organism.lineageId);
        if (state.initiativeTendency > 0) initiativeLeaning++;
        else responseLeaning++;
      }
      tendencySum += state.initiativeTendency;
      absoluteSum += abs;
      learningSum += ph.roleLearning;
      population++;
    }

    stepCount++;
    stats.steps = stepCount;
    stats.differentiatedOrganisms = differentiated;
    stats.initiativeLeaningOrganisms = initiativeLeaning;
    stats.responseLeaningOrganisms = responseLeaning;
    stats.roleBearingLineages = lineages.size;
    stats.meanInitiativeTendency = population ? tendencySum / population : 0;
    stats.meanAbsoluteDifferentiation = population ? absoluteSum / population : 0;
    stats.meanRoleLearning = population ? learningSum / population : 0;
  }

  const previousStep = modules.step.bind(modules);
  modules.step = function v64RoleDifferentiationStep(dt) {
    const result = previousStep(dt);
    accumulator += Number(dt) || 0;
    if (accumulator >= STEP_SECONDS) {
      accumulator = 0;
      roleStep();
    }
    return result;
  };

  const api = {
    installed:true,
    getStats:() => ({
      ...stats,
      installed:true,
      version:'v64a-history-dependent-initiative-response',
      rolesLearnedFromOwnHistoryOnly:true,
      initiationsFromOwnV56Acts:true,
      responsesFromOwnV63Applications:true,
      noPartnerPrivateRoleInspection:true,
      complementarityUsesOwnV57PartnerModel:true,
      complementaryHistoryBiasesAudienceSelection:true,
      responseHistoryModifiesFutureV63Commitment:true,
      noExplicitRoleLabels:true,
      noLeaderOrRankState:true,
      noStoredGroupRoleAssignment:true,
      historyCanBreakGeneticSymmetry:true,
      scalarRoleMemory:true,
      minimumRoleEvidence:MIN_ROLE_EVIDENCE,
      roleBiasThreshold:ROLE_BIAS_THRESHOLD,
      authoritativeFixedStep:true,
      noHardPopulationCap:true,
      noHardDisplayCap:true,
      surfaceRendererEnabled:false,
    }),
    getRole(id) {
      const state = motile.get(id)?.bioV64;
      if (!state) return null;
      return {
        roleLearning:state.roleLearning,
        complementaritySensitivity:state.complementaritySensitivity,
        persistencePlasticity:state.persistencePlasticity,
        initiativeTendency:state.initiativeTendency,
        roleEvidence:state.roleEvidence,
        initiations:state.initiations,
        responses:state.responses,
        lastRoleUpdate:state.lastRoleUpdate ? { ...state.lastRoleUpdate } : null,
        lastComplementarityAdjustment:state.lastComplementarityAdjustment ? { ...state.lastComplementarityAdjustment } : null,
        lastCommitmentAdjustment:state.lastCommitmentAdjustment ? { ...state.lastCommitmentAdjustment } : null,
      };
    },
    getComplementarityAdjustment(observerId, partnerId) {
      return { ...complementarityAdjustment(observerId, partnerId) };
    },
    getPopulationRoles() {
      return [...motile.entries()]
        .map(([id, organism]) => ({ id, lineageId:organism.lineageId, role:api.getRole(id) }))
        .filter(item => item.role);
    },
  };

  window.realitySandboxRoleDifferentiationV64 = api;
  window.realitySandboxEvolutionBuild = 'evolution-v64-role-differentiation';
  document.documentElement.dataset.evolutionBuild = 'evolution-v64-role-differentiation';
  document.documentElement.dataset.roleDifferentiationV64 = 'history-dependent-complementarity';
}

waitForRuntime().then(install);
