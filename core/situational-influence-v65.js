const STEP_SECONDS = 0.9;
const INFLUENCE_THRESHOLD = 0.12;
const ROLE_BIAS_THRESHOLD = 0.22;
const MIN_ROLE_EVIDENCE = 2;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number(v) || 0));
const clampSigned = v => Math.max(-1, Math.min(1, Number(v) || 0));

async function waitForRuntime() {
  while (true) {
    const social = window.realitySandboxSocialModelsV57;
    const roles = window.realitySandboxRoleDifferentiationV64;
    const jointAction = window.realitySandboxCoalitionJointActionV63;
    const planet = window.realitySandboxPlanet;
    const modules = window.realitySandboxModules;
    const motile = planet?.world?.ecs?.components?.motile;
    if (
      social?.installed && roles?.installed && jointAction?.installed &&
      typeof jointAction.addCommitmentModifier === 'function' &&
      modules?.step && motile instanceof Map
    ) return { social, roles, jointAction, planet, modules };
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ social, roles, jointAction, planet, modules }) {
  if (window.realitySandboxSituationalInfluenceV65?.installed) return;

  const { motile } = planet.world.ecs.components;
  let accumulator = 0;
  let stepCount = 0;

  const stats = {
    steps:0,
    positiveInfluenceAdjustments:0,
    negativeInfluenceAdjustments:0,
    derivedInfluenceEdges:0,
    influencedObservers:0,
    concentratedInfluencers:0,
    influenceBearingLineages:0,
    meanPositiveInfluence:0,
    meanAbsoluteInfluence:0,
  };

  function phenotype(g = {}) {
    const brain = clamp(g.brainSpeed);
    const sociality = clamp(g.sociality);
    const sense = clamp(g.sense);
    return {
      influenceSensitivity:clamp(0.08 + brain * 0.34 + sociality * 0.34 + sense * 0.14),
      outcomeSelectivity:clamp(0.08 + brain * 0.30 + sociality * 0.28 + sense * 0.20),
    };
  }

  function ensureState(organism, ph) {
    if (!organism.bioV65) {
      organism.bioV65 = {
        influenceSensitivity:ph.influenceSensitivity,
        outcomeSelectivity:ph.outcomeSelectivity,
        lastInfluenceAdjustment:null,
      };
    }
    organism.bioV65.influenceSensitivity = ph.influenceSensitivity;
    organism.bioV65.outcomeSelectivity = ph.outcomeSelectivity;
    return organism.bioV65;
  }

  function responseReadiness(observerId) {
    const role = roles.getRole?.(observerId);
    if (!role || role.roleEvidence < MIN_ROLE_EVIDENCE) return 0;
    const specialization = clamp((-role.initiativeTendency - ROLE_BIAS_THRESHOLD) / (1 - ROLE_BIAS_THRESHOLD));
    return specialization * clamp(role.roleEvidence / 4);
  }

  function ownSpeakerEvidence(observerId, speakerId) {
    const model = social.getSocialModel?.(observerId)?.models?.[String(speakerId)] || null;
    if (!model) return null;
    const reliable = Math.max(0, Number(model.reliableClaims) || 0);
    const unreliable = Math.max(0, Number(model.unreliableClaims) || 0);
    const claimTrials = reliable + unreliable;
    const observations = Math.max(0, Number(model.observations) || 0);
    const evidence = clamp((observations + claimTrials) / 5);
    if (evidence <= 0) return null;
    const outcomeBalance = claimTrials > 0 ? (reliable - unreliable) / claimTrials : 0;
    const trust = clampSigned(model.trust);
    const familiarity = clamp(model.familiarity);
    const reliability = clampSigned(
      trust * 0.52 +
      outcomeBalance * 0.38 +
      (familiarity - 0.5) * 0.10
    );
    return { reliability, evidence, trust, outcomeBalance, familiarity, observations, claimTrials };
  }

  function influenceFor(observerId, speakerId) {
    const observer = motile.get(observerId);
    const speaker = motile.get(speakerId);
    if (!observer || !speaker || observer.lineageId !== speaker.lineageId) return { score:0, reason:'missing-or-nonkin' };
    const readiness = responseReadiness(observerId);
    if (readiness <= 0) return { score:0, reason:'not-response-leaning' };
    const evidence = ownSpeakerEvidence(observerId, speakerId);
    if (!evidence) return { score:0, reason:'no-own-speaker-history' };
    const ph = phenotype(observer.genome);
    const score = clampSigned(
      readiness * evidence.evidence * evidence.reliability *
      (0.76 + ph.influenceSensitivity * 0.24)
    );
    return { score, readiness, ...evidence };
  }

  function influenceGraph() {
    const edges = [];
    const incoming = new Map();
    const observers = new Set();
    const lineages = new Set();

    for (const [observerId, observer] of motile.entries()) {
      if (responseReadiness(observerId) <= 0) continue;
      const ownModels = social.getSocialModel?.(observerId)?.models || {};
      for (const key of Object.keys(ownModels)) {
        const speakerId = Number(key);
        if (!Number.isFinite(speakerId) || speakerId === observerId) continue;
        const result = influenceFor(observerId, speakerId);
        if (result.score < INFLUENCE_THRESHOLD) continue;
        edges.push({ observerId, speakerId, strength:result.score });
        observers.add(observerId);
        lineages.add(observer.lineageId);
        const current = incoming.get(speakerId) || { speakerId, observers:0, strength:0 };
        current.observers++;
        current.strength += result.score;
        incoming.set(speakerId, current);
      }
    }

    return {
      edges,
      incoming:[...incoming.values()].sort((a,b) => b.observers - a.observers || b.strength - a.strength),
      influencedObservers:observers.size,
      lineages:lineages.size,
    };
  }

  jointAction.addCommitmentModifier(({ organismId, speakerId, currentDuration, currentStrength }) => {
    const observer = motile.get(organismId);
    if (!observer) return null;
    const ph = phenotype(observer.genome);
    const state = ensureState(observer, ph);
    const result = influenceFor(organismId, speakerId);
    if (Math.abs(result.score) < INFLUENCE_THRESHOLD) {
      state.lastInfluenceAdjustment = null;
      return null;
    }

    const positive = result.score > 0;
    const durationAdjustment = positive ? 1 : -1;
    const strengthAdjustment = result.score * (0.04 + ph.outcomeSelectivity * 0.04);
    state.lastInfluenceAdjustment = {
      speakerId,
      influenceScore:result.score,
      trust:result.trust,
      outcomeBalance:result.outcomeBalance,
      evidence:result.evidence,
      responseReadiness:result.readiness,
      currentDuration,
      currentStrength,
      durationAdjustment,
      strengthAdjustment,
      step:stepCount,
    };
    if (positive) stats.positiveInfluenceAdjustments++;
    else stats.negativeInfluenceAdjustments++;
    return { durationAdjustment, strengthAdjustment };
  });

  function influenceStep() {
    const graph = influenceGraph();
    let positiveSum = 0;
    let absoluteSum = 0;
    for (const edge of graph.edges) {
      positiveSum += edge.strength;
      absoluteSum += Math.abs(edge.strength);
    }
    stepCount++;
    stats.steps = stepCount;
    stats.derivedInfluenceEdges = graph.edges.length;
    stats.influencedObservers = graph.influencedObservers;
    stats.concentratedInfluencers = graph.incoming.filter(item => item.observers >= 2).length;
    stats.influenceBearingLineages = graph.lineages;
    stats.meanPositiveInfluence = graph.edges.length ? positiveSum / graph.edges.length : 0;
    stats.meanAbsoluteInfluence = graph.edges.length ? absoluteSum / graph.edges.length : 0;
  }

  const previousStep = modules.step.bind(modules);
  modules.step = function v65SituationalInfluenceStep(dt) {
    const result = previousStep(dt);
    accumulator += Number(dt) || 0;
    if (accumulator >= STEP_SECONDS) {
      accumulator = 0;
      influenceStep();
    }
    return result;
  };

  const api = {
    installed:true,
    getStats:() => ({
      ...stats,
      installed:true,
      version:'v65a-derived-situational-influence',
      influenceFromOwnV57OutcomesOnly:true,
      responseReadinessFromOwnV64History:true,
      noSpeakerPrivateRoleInspection:true,
      noGlobalLeaderState:true,
      noLeaderRankOrOffice:true,
      noStoredInfluenceMembership:true,
      influenceGraphDerivedOnDemand:true,
      multipleObserversCanConvergeIndependently:true,
      influenceCanMoveWhenOutcomesChange:true,
      influenceModifiesBoundedV63Commitment:true,
      negativeOutcomesCanReduceCommitment:true,
      influenceThreshold:INFLUENCE_THRESHOLD,
      authoritativeFixedStep:true,
      noHardPopulationCap:true,
      noHardDisplayCap:true,
      surfaceRendererEnabled:false,
    }),
    getInfluence(observerId, speakerId) {
      return { ...influenceFor(observerId, speakerId) };
    },
    getInfluenceState(id) {
      const state = motile.get(id)?.bioV65;
      if (!state) return null;
      return {
        influenceSensitivity:state.influenceSensitivity,
        outcomeSelectivity:state.outcomeSelectivity,
        lastInfluenceAdjustment:state.lastInfluenceAdjustment ? { ...state.lastInfluenceAdjustment } : null,
      };
    },
    getInfluenceGraph() {
      const graph = influenceGraph();
      return {
        edges:graph.edges.map(edge => ({ ...edge })),
        incoming:graph.incoming.map(item => ({ ...item })),
      };
    },
    getPopulationInfluence() {
      return [...motile.entries()]
        .map(([id, organism]) => ({ id, lineageId:organism.lineageId, influence:api.getInfluenceState(id) }))
        .filter(item => item.influence);
    },
  };

  window.realitySandboxSituationalInfluenceV65 = api;
  window.realitySandboxEvolutionBuild = 'evolution-v65-situational-influence';
  document.documentElement.dataset.evolutionBuild = 'evolution-v65-situational-influence';
  document.documentElement.dataset.situationalInfluenceV65 = 'derived-reversible-influence';
}

waitForRuntime().then(install);
