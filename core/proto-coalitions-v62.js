const STEP_SECONDS = 0.9;
const MAX_AFFILIATIONS = 8;
const MUTUAL_BOND_THRESHOLD = 0.36;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number(v) || 0));
const clampSigned = v => Math.max(-1, Math.min(1, Number(v) || 0));

async function waitForRuntime() {
  while (true) {
    const social = window.realitySandboxSocialModelsV57;
    const cooperation = window.realitySandboxReciprocalCooperationV58;
    const reputation = window.realitySandboxPublicReputationV59;
    const norms = window.realitySandboxLocalSocialNormsV61;
    const planet = window.realitySandboxPlanet;
    const modules = window.realitySandboxModules;
    const motile = planet?.world?.ecs?.components?.motile;
    if (
      social?.installed && cooperation?.installed && reputation?.installed && norms?.installed &&
      typeof social.scoreAudience === 'function' && modules?.step && motile instanceof Map
    ) return { social, cooperation, reputation, norms, planet, modules };
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ social, cooperation, reputation, planet, modules }) {
  if (window.realitySandboxProtoCoalitionsV62?.installed) return;

  const { motile } = planet.world.ecs.components;
  const nativeScoreAudience = social.scoreAudience.bind(social);
  let accumulator = 0;
  let stepCount = 0;

  const stats = {
    steps:0,
    affiliationUpdates:0,
    affiliationDecays:0,
    audienceScoreAdjustments:0,
    activeAffiliations:0,
    mutualAffiliationEdges:0,
    coalitionComponents:0,
    coalitionMembers:0,
    oneSidedAffiliations:0,
    meanAffiliation:0,
    meanAffiliationLearning:0,
  };

  function phenotype(g = {}) {
    const brain = clamp(g.brainSpeed);
    const sociality = clamp(g.sociality);
    const sense = clamp(g.sense);
    return {
      affiliationLearning:clamp(0.08 + brain * 0.42 + sociality * 0.34 + sense * 0.10),
      loyalty:clamp(0.06 + sociality * 0.48 + brain * 0.24 + sense * 0.08),
      partnerSelectivity:clamp(0.08 + brain * 0.32 + sociality * 0.38 + sense * 0.14),
    };
  }

  function newAffiliation(partnerId) {
    return {
      partnerId,
      affinity:0,
      evidenceStrength:0,
      directAidEvidence:0,
      communicationEvidence:0,
      witnessedProsocialEvidence:0,
      sourceMask:0,
      lastEvidenceStep:stepCount,
      updatedAtStep:stepCount,
    };
  }

  function ensureState(organism, ph) {
    if (!organism.bioV62) {
      organism.bioV62 = {
        affiliationLearning:ph.affiliationLearning,
        loyalty:ph.loyalty,
        partnerSelectivity:ph.partnerSelectivity,
        affiliations:{},
        preferredAffiliateId:null,
        preferredAffiliateScore:0,
        lastAudienceAdjustment:null,
      };
    }
    const state = organism.bioV62;
    state.affiliationLearning = ph.affiliationLearning;
    state.loyalty = ph.loyalty;
    state.partnerSelectivity = ph.partnerSelectivity;
    state.affiliations ||= {};
    return state;
  }

  function candidateEvidence(observerId, partnerId) {
    const ownCooperation = cooperation.getCooperation?.(observerId);
    const ledger = ownCooperation?.ledgers?.[String(partnerId)] || null;
    const ownSocial = social.getSocialModel?.(observerId);
    const model = ownSocial?.models?.[String(partnerId)] || null;
    const rep = reputation.getReputation?.(observerId, partnerId) || null;

    let directAidEvidence = 0;
    let communicationEvidence = 0;
    let witnessedProsocialEvidence = 0;
    let weight = 0;
    let weightedTarget = 0;
    let sourceMask = 0;

    if (ledger && (ledger.giftsGiven > 0 || ledger.giftsReceived > 0)) {
      const gifts = (ledger.giftsGiven || 0) + (ledger.giftsReceived || 0);
      const repeated = clamp(gifts / 2);
      const bothWays = ledger.giftsGiven > 0 && ledger.giftsReceived > 0 ? 1 : 0;
      const total = (Number(ledger.given) || 0) + (Number(ledger.received) || 0);
      const balance = total > 1e-9
        ? 1 - clamp(Math.abs((Number(ledger.given) || 0) - (Number(ledger.received) || 0)) / total)
        : 0;
      directAidEvidence = clamp(repeated * 0.38 + bothWays * 0.34 + balance * 0.18 + clamp(ledger.familiarity) * 0.10);
      weightedTarget += directAidEvidence * 0.58;
      weight += 0.58;
      sourceMask |= 1;
    }

    if (model && (model.observations > 0 || model.successfulResponses > 0 || model.failedResponses > 0)) {
      const trials = (model.successfulResponses || 0) + (model.failedResponses || 0);
      const evidence = clamp(((model.observations || 0) + trials) / 5);
      const trust = clampSigned(model.trust);
      const responsiveness = clampSigned(model.responsiveness);
      communicationEvidence = clampSigned(
        (trust * 0.48 + responsiveness * 0.40 + clamp(model.familiarity) * 0.12) * evidence
      );
      weightedTarget += communicationEvidence * 0.27;
      weight += 0.27;
      sourceMask |= 2;
    }

    if (rep && rep.aidWitnesses > 0) {
      const evidence = clamp(rep.aidWitnesses / 4);
      witnessedProsocialEvidence = clamp(
        rep.prosociality * (0.76 + evidence * 0.16) + rep.familiarity * 0.08
      );
      weightedTarget += witnessedProsocialEvidence * 0.15;
      weight += 0.15;
      sourceMask |= 4;
    }

    const target = weight > 0 ? clampSigned(weightedTarget / weight) : 0;
    const evidenceStrength = clamp(
      directAidEvidence * 0.58 +
      Math.abs(communicationEvidence) * 0.27 +
      witnessedProsocialEvidence * 0.15
    );
    return {
      target,
      evidenceStrength,
      directAidEvidence,
      communicationEvidence,
      witnessedProsocialEvidence,
      sourceMask,
    };
  }

  function retentionScore(entry) {
    const recency = clamp((stepCount - entry.lastEvidenceStep) / 240);
    return Math.abs(entry.affinity) * 0.48 + entry.evidenceStrength * 0.44 - recency * 0.08;
  }

  function ensureAffiliation(state, partnerId) {
    const key = String(partnerId);
    if (state.affiliations[key]) return state.affiliations[key];
    const keys = Object.keys(state.affiliations);
    if (keys.length >= MAX_AFFILIATIONS) {
      let weakest = null;
      let weakestScore = Infinity;
      for (const existing of keys) {
        const score = retentionScore(state.affiliations[existing]);
        if (score < weakestScore) {
          weakestScore = score;
          weakest = existing;
        }
      }
      if (weakest != null) delete state.affiliations[weakest];
    }
    return state.affiliations[key] = newAffiliation(partnerId);
  }

  function ownCandidateIds(id) {
    const ids = new Set();
    const ownCooperation = cooperation.getCooperation?.(id);
    for (const key of Object.keys(ownCooperation?.ledgers || {})) ids.add(Number(key));
    const ownSocial = social.getSocialModel?.(id);
    for (const key of Object.keys(ownSocial?.models || {})) ids.add(Number(key));
    const ownReputation = reputation.getObserverReputations?.(id);
    for (const entry of Object.values(ownReputation?.reputations || {})) ids.add(Number(entry.targetId));
    ids.delete(id);
    return [...ids].filter(Number.isFinite);
  }

  function updateAffiliations(id, organism, state, ph) {
    const candidates = ownCandidateIds(id);
    const touched = new Set();
    for (const partnerId of candidates) {
      const partner = motile.get(partnerId);
      if (!partner || partner.lineageId !== organism.lineageId) continue;
      const evidence = candidateEvidence(id, partnerId);
      if (!evidence.sourceMask || evidence.evidenceStrength <= 0.001) continue;
      const entry = ensureAffiliation(state, partnerId);
      const learning = 0.18 + ph.affiliationLearning * 0.22;
      entry.affinity = clampSigned(entry.affinity * (1 - learning) + evidence.target * learning);
      entry.evidenceStrength = evidence.evidenceStrength;
      entry.directAidEvidence = evidence.directAidEvidence;
      entry.communicationEvidence = evidence.communicationEvidence;
      entry.witnessedProsocialEvidence = evidence.witnessedProsocialEvidence;
      entry.sourceMask = evidence.sourceMask;
      entry.lastEvidenceStep = stepCount;
      entry.updatedAtStep = stepCount;
      touched.add(String(partnerId));
      stats.affiliationUpdates++;
    }

    for (const [key, entry] of Object.entries(state.affiliations)) {
      if (touched.has(key)) continue;
      const partner = motile.get(entry.partnerId);
      if (!partner || partner.lineageId !== organism.lineageId) {
        delete state.affiliations[key];
        continue;
      }
      const decay = 0.003 * (1.10 - ph.affiliationLearning * 0.70);
      entry.affinity *= 1 - decay;
      entry.evidenceStrength *= 1 - decay * 0.6;
      stats.affiliationDecays++;
      if (Math.abs(entry.affinity) < 0.01 && entry.evidenceStrength < 0.01) delete state.affiliations[key];
    }

    let bestId = null;
    let bestScore = -Infinity;
    for (const entry of Object.values(state.affiliations)) {
      const score = entry.affinity * (0.72 + ph.partnerSelectivity * 0.18) + entry.evidenceStrength * 0.10;
      if (score > bestScore) {
        bestScore = score;
        bestId = entry.partnerId;
      }
    }
    state.preferredAffiliateId = bestScore > 0 ? bestId : null;
    state.preferredAffiliateScore = Number.isFinite(bestScore) && bestScore > 0 ? bestScore : 0;
  }

  function affiliationAudienceScore(observerId, partnerId, baseScore) {
    const observer = motile.get(observerId);
    const state = observer?.bioV62;
    const entry = state?.affiliations?.[String(partnerId)];
    if (!entry || entry.evidenceStrength < 0.05) return Number(baseScore) || 0;
    const adjustment = clampSigned(entry.affinity) *
      (0.08 + clamp(state.loyalty) * 0.08 + clamp(state.partnerSelectivity) * 0.04) *
      (0.55 + entry.evidenceStrength * 0.45);
    stats.audienceScoreAdjustments++;
    state.lastAudienceAdjustment = {
      partnerId,
      baseScore:Number(baseScore) || 0,
      adjustment,
      finalScore:(Number(baseScore) || 0) + adjustment,
      step:stepCount,
    };
    return (Number(baseScore) || 0) + adjustment;
  }

  social.scoreAudience = function v62AffiliationAudienceScore(observerId, partnerId, baseScore, ...rest) {
    const inherited = nativeScoreAudience(observerId, partnerId, baseScore, ...rest);
    return affiliationAudienceScore(observerId, partnerId, inherited);
  };

  function coalitionGraph() {
    const edges = [];
    const adjacency = new Map();
    let oneSided = 0;

    for (const [id, organism] of motile.entries()) {
      for (const entry of Object.values(organism.bioV62?.affiliations || {})) {
        if (entry.affinity < MUTUAL_BOND_THRESHOLD || entry.evidenceStrength < 0.20) continue;
        const reverse = motile.get(entry.partnerId)?.bioV62?.affiliations?.[String(id)] || null;
        if (!reverse || reverse.affinity < MUTUAL_BOND_THRESHOLD || reverse.evidenceStrength < 0.20) {
          oneSided++;
          continue;
        }
        if (id > entry.partnerId) continue;
        const strength = Math.min(entry.affinity, reverse.affinity);
        edges.push({ a:id, b:entry.partnerId, strength });
        if (!adjacency.has(id)) adjacency.set(id, new Set());
        if (!adjacency.has(entry.partnerId)) adjacency.set(entry.partnerId, new Set());
        adjacency.get(id).add(entry.partnerId);
        adjacency.get(entry.partnerId).add(id);
      }
    }

    const components = [];
    const visited = new Set();
    for (const id of adjacency.keys()) {
      if (visited.has(id)) continue;
      const members = [];
      const queue = [id];
      visited.add(id);
      while (queue.length) {
        const current = queue.shift();
        members.push(current);
        for (const neighbor of adjacency.get(current) || []) {
          if (visited.has(neighbor)) continue;
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
      if (members.length >= 2) components.push({ members:members.sort((a,b) => a-b) });
    }
    return { edges, components, oneSidedAffiliations:oneSided };
  }

  function affiliationStep() {
    let affinitySum = 0;
    let active = 0;
    let learningSum = 0;
    let population = 0;

    for (const [id, organism] of motile.entries()) {
      const ph = phenotype(organism.genome);
      const state = ensureState(organism, ph);
      updateAffiliations(id, organism, state, ph);
      for (const entry of Object.values(state.affiliations)) {
        affinitySum += entry.affinity;
        active++;
      }
      learningSum += ph.affiliationLearning;
      population++;
    }

    const graph = coalitionGraph();
    const coalitionMembers = new Set(graph.components.flatMap(component => component.members));
    stepCount++;
    stats.steps = stepCount;
    stats.activeAffiliations = active;
    stats.mutualAffiliationEdges = graph.edges.length;
    stats.coalitionComponents = graph.components.length;
    stats.coalitionMembers = coalitionMembers.size;
    stats.oneSidedAffiliations = graph.oneSidedAffiliations;
    stats.meanAffiliation = active ? affinitySum / active : 0;
    stats.meanAffiliationLearning = population ? learningSum / population : 0;
  }

  const previousStep = modules.step.bind(modules);
  modules.step = function v62ProtoCoalitionStep(dt) {
    const result = previousStep(dt);
    accumulator += Number(dt) || 0;
    if (accumulator >= STEP_SECONDS) {
      accumulator = 0;
      affiliationStep();
    }
    return result;
  };

  const api = {
    installed:true,
    getStats:() => ({
      ...stats,
      installed:true,
      version:'v62a-mutual-affiliation-networks',
      agentsUseOwnEvidenceOnly:true,
      directCooperationEvidence:true,
      communicationOutcomeEvidence:true,
      witnessedPublicBehaviorEvidence:true,
      noPrivateAffiliationInspectionForBehavior:true,
      noExplicitGroupIdentity:true,
      noStoredCoalitionMembership:true,
      coalitionDerivedFromMutualAffiliation:true,
      oneSidedAffinityDoesNotCreateCoalition:true,
      affiliationBiasesAudienceSelection:true,
      boundedAffiliationMemory:true,
      maxAffiliations:MAX_AFFILIATIONS,
      mutualBondThreshold:MUTUAL_BOND_THRESHOLD,
      evidenceRequiresPriorLocalSocialExperience:true,
      authoritativeFixedStep:true,
      noHardPopulationCap:true,
      noHardDisplayCap:true,
      surfaceRendererEnabled:false,
    }),
    getAffiliation(id) {
      const state = motile.get(id)?.bioV62;
      if (!state) return null;
      return {
        affiliationLearning:state.affiliationLearning,
        loyalty:state.loyalty,
        partnerSelectivity:state.partnerSelectivity,
        preferredAffiliateId:state.preferredAffiliateId,
        preferredAffiliateScore:state.preferredAffiliateScore,
        lastAudienceAdjustment:state.lastAudienceAdjustment ? { ...state.lastAudienceAdjustment } : null,
        affiliations:Object.fromEntries(Object.entries(state.affiliations).map(([key, entry]) => [key, { ...entry }])),
      };
    },
    getCoalitionGraph() {
      const graph = coalitionGraph();
      return {
        edges:graph.edges.map(edge => ({ ...edge })),
        components:graph.components.map(component => ({ members:component.members.slice() })),
        oneSidedAffiliations:graph.oneSidedAffiliations,
      };
    },
    getPopulationAffiliations() {
      return [...motile.entries()]
        .map(([id, organism]) => ({ id, lineageId:organism.lineageId, affiliation:api.getAffiliation(id) }))
        .filter(item => item.affiliation);
    },
  };

  window.realitySandboxProtoCoalitionsV62 = api;
  window.realitySandboxEvolutionBuild = 'evolution-v62-proto-coalitions';
  document.documentElement.dataset.evolutionBuild = 'evolution-v62-proto-coalitions';
  document.documentElement.dataset.protoCoalitionsV62 = 'mutual-affiliation-network';
}

waitForRuntime().then(install);
