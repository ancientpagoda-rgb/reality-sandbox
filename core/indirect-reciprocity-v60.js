const STEP_SECONDS = 0.9;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number(v) || 0));

async function waitForRuntime() {
  while (true) {
    const cooperation = window.realitySandboxReciprocalCooperationV58;
    const reputation = window.realitySandboxPublicReputationV59;
    const planet = window.realitySandboxPlanet;
    const modules = window.realitySandboxModules;
    const motile = planet?.world?.ecs?.components?.motile;
    if (
      cooperation?.installed && reputation?.installed &&
      typeof cooperation.setAidRequestScoreModifier === 'function' &&
      modules?.step && motile instanceof Map
    ) return { cooperation, reputation, planet, modules };
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ cooperation, reputation, planet, modules }) {
  if (window.realitySandboxIndirectReciprocityV60?.installed) return;

  const { motile } = planet.world.ecs.components;
  let accumulator = 0;
  let stepCount = 0;
  const seenChoiceStep = new Map();

  const stats = {
    steps:0,
    scoreEvaluations:0,
    noEvidencePassThroughs:0,
    witnessedReputationUses:0,
    positiveScoreAdjustments:0,
    totalScoreAdjustment:0,
    indirectlyBiasedAidChoices:0,
    indirectlyBiasedAidEvents:0,
    activeIndirectReciprocators:0,
    indirectReciprocityLineages:0,
    meanIndirectReciprocity:0,
  };

  function phenotype(g = {}) {
    const brain = clamp(g.brainSpeed);
    const sociality = clamp(g.sociality);
    const sense = clamp(g.sense);
    return {
      indirectReciprocity:clamp(0.04 + brain * 0.44 + sociality * 0.40 + sense * 0.10),
      evidenceSensitivity:clamp(0.08 + brain * 0.36 + sociality * 0.34 + sense * 0.16),
    };
  }

  function ensureState(organism, ph) {
    if (!organism.bioV60) {
      organism.bioV60 = {
        indirectReciprocity:ph.indirectReciprocity,
        evidenceSensitivity:ph.evidenceSensitivity,
        lastScoredRequester:null,
        lastIndirectAidChoice:null,
      };
    }
    organism.bioV60.indirectReciprocity = ph.indirectReciprocity;
    organism.bioV60.evidenceSensitivity = ph.evidenceSensitivity;
    return organism.bioV60;
  }

  function scoreAidRequest(context) {
    stats.scoreEvaluations++;
    const helper = motile.get(context.helperId);
    if (!helper) return context.baseScore;

    const ph = phenotype(helper.genome);
    const state = ensureState(helper, ph);
    const entry = reputation.getReputation?.(context.helperId, context.requesterId) || null;
    if (!entry || entry.aidWitnesses < 1) {
      stats.noEvidencePassThroughs++;
      state.lastScoredRequester = {
        requesterId:context.requesterId,
        baseScore:context.baseScore,
        adjustment:0,
        witnessed:false,
        step:stepCount,
      };
      return context.baseScore;
    }

    const evidence = clamp(entry.aidWitnesses / 4);
    const adjustment = clamp(
      (
        entry.prosociality * (0.13 + evidence * 0.10) +
        entry.familiarity * 0.025
      ) *
      (0.52 + ph.indirectReciprocity * 0.34 + ph.evidenceSensitivity * 0.14),
      0,
      0.22
    );

    stats.witnessedReputationUses++;
    if (adjustment > 0) {
      stats.positiveScoreAdjustments++;
      stats.totalScoreAdjustment += adjustment;
    }
    state.lastScoredRequester = {
      requesterId:context.requesterId,
      baseScore:context.baseScore,
      adjustment,
      witnessed:true,
      prosociality:entry.prosociality,
      aidWitnesses:entry.aidWitnesses,
      familiarity:entry.familiarity,
      step:stepCount,
    };
    return context.baseScore + adjustment;
  }

  function captureAidChoices() {
    let active = 0;
    let indirectSum = 0;
    let population = 0;
    const lineages = new Set();

    for (const [id, organism] of motile.entries()) {
      const ph = phenotype(organism.genome);
      const state = ensureState(organism, ph);
      const choice = cooperation.getCooperation?.(id)?.lastAidChoice || null;
      if (choice && seenChoiceStep.get(id) !== choice.step) {
        seenChoiceStep.set(id, choice.step);
        if ((Number(choice.externalScoreAdjustment) || 0) > 1e-9) {
          state.lastIndirectAidChoice = {
            requesterId:choice.requesterId,
            baseScore:Number(choice.baseScore) || 0,
            finalScore:Number(choice.score) || 0,
            adjustment:Number(choice.externalScoreAdjustment) || 0,
            emitted:Boolean(choice.emitted),
            reciprocal:Boolean(choice.reciprocal),
            step:choice.step,
          };
          stats.indirectlyBiasedAidChoices++;
          if (choice.emitted) stats.indirectlyBiasedAidEvents++;
        }
      }
      if (state.lastIndirectAidChoice) {
        active++;
        lineages.add(organism.lineageId);
      }
      indirectSum += ph.indirectReciprocity;
      population++;
    }

    stepCount++;
    stats.steps = stepCount;
    stats.activeIndirectReciprocators = active;
    stats.indirectReciprocityLineages = lineages.size;
    stats.meanIndirectReciprocity = population ? indirectSum / population : 0;
  }

  function installModifier() {
    return cooperation.setAidRequestScoreModifier(scoreAidRequest);
  }

  installModifier();

  const previousStep = modules.step.bind(modules);
  modules.step = function v60IndirectReciprocityStep(dt) {
    const result = previousStep(dt);
    accumulator += Number(dt) || 0;
    if (accumulator >= STEP_SECONDS) {
      accumulator = 0;
      captureAidChoices();
    }
    return result;
  };

  const api = {
    installed:true,
    installModifier,
    scoreAidRequest,
    getStats:() => ({
      ...stats,
      installed:true,
      version:'v60a-local-indirect-reciprocity',
      ownWitnessedReputationOnly:true,
      reputationEvidenceFromV59Only:true,
      noGlobalReputationLookup:true,
      noBorrowedPrivateLedgers:true,
      noHiddenRecipientNeedInspection:true,
      noEvidencePreservesV58Score:true,
      boundedReputationInput:true,
      aidRankingOnly:true,
      v58ConservedTransferPreserved:true,
      authoritativeFixedStep:true,
      noHardPopulationCap:true,
      noHardDisplayCap:true,
      surfaceRendererEnabled:false,
    }),
    getIndirectReciprocity(id) {
      const state = motile.get(id)?.bioV60;
      if (!state) return null;
      return {
        indirectReciprocity:state.indirectReciprocity,
        evidenceSensitivity:state.evidenceSensitivity,
        lastScoredRequester:state.lastScoredRequester ? { ...state.lastScoredRequester } : null,
        lastIndirectAidChoice:state.lastIndirectAidChoice ? { ...state.lastIndirectAidChoice } : null,
      };
    },
    getPopulationIndirectReciprocity() {
      return [...motile.entries()]
        .map(([id, organism]) => ({
          id,
          lineageId:organism.lineageId,
          indirectReciprocity:api.getIndirectReciprocity(id),
        }))
        .filter(item => item.indirectReciprocity);
    },
  };

  window.realitySandboxIndirectReciprocityV60 = api;
  window.realitySandboxEvolutionBuild = 'evolution-v60-indirect-reciprocity';
  document.documentElement.dataset.evolutionBuild = 'evolution-v60-indirect-reciprocity';
  document.documentElement.dataset.indirectReciprocityV60 = 'local-witnessed-aid-ranking';
}

waitForRuntime().then(install);
