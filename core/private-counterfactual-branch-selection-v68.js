const STEP_SECONDS = 0.9;
const MAX_VALUE_RECORDS = 12;
const MIN_VALUE_SAMPLES = 2;
const MIN_BRANCH_VALUE_MARGIN = 0.12;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number(v) || 0));

async function waitForRuntime() {
  while (true) {
    const consensus = window.realitySandboxDistributedConsensusV66;
    const planning = window.realitySandboxDistributedPlanningV67;
    const planet = window.realitySandboxPlanet;
    const modules = window.realitySandboxModules;
    const c = planet?.world?.ecs?.components;
    if (consensus?.installed && planning?.installed && modules?.step && c?.motile instanceof Map) {
      return { consensus, planning, planet, modules };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ consensus, planning, planet, modules }) {
  if (window.realitySandboxCounterfactualBranchSelectionV68?.installed) return;

  const { motile } = planet.world.ecs.components;
  let accumulator = 0;
  let stepCount = 0;

  const stats = {
    steps:0,
    observedOwnDecisionTransitions:0,
    learnedValueRecords:0,
    updatedValueRecords:0,
    counterfactualComparisons:0,
    privateBranchChoices:0,
    privatePlanOverrides:0,
    insufficientAlternativeEvidence:0,
    organismsWithPrivateValues:0,
    meanChosenValueMargin:0,
  };

  function phenotype(g = {}) {
    const brain = clamp(g.brainSpeed);
    const sense = clamp(g.sense);
    const sociality = clamp(g.sociality);
    return {
      counterfactualSensitivity:clamp(0.08 + brain * 0.44 + sense * 0.22 + sociality * 0.18),
      outcomeValueLearning:clamp(0.10 + brain * 0.32 + sense * 0.20 + sociality * 0.22),
    };
  }

  function ensureState(organism, ph) {
    if (!organism.bioV68) {
      organism.bioV68 = {
        counterfactualSensitivity:ph.counterfactualSensitivity,
        outcomeValueLearning:ph.outcomeValueLearning,
        transitionValues:{},
        lastObservedDecisionStep:null,
        lastObservedProposalKey:null,
        lastCounterfactualChoice:null,
        lastPlanOverride:null,
      };
    }
    organism.bioV68.counterfactualSensitivity = ph.counterfactualSensitivity;
    organism.bioV68.outcomeValueLearning = ph.outcomeValueLearning;
    return organism.bioV68;
  }

  function valueKey(fromProposalKey, toProposalKey) {
    return `${fromProposalKey}>${toProposalKey}`;
  }

  function pruneValues(state) {
    const entries = Object.entries(state.transitionValues || {});
    if (entries.length <= MAX_VALUE_RECORDS) return;
    entries.sort((a,b) => (a[1].samples || 0) - (b[1].samples || 0) || (a[1].lastObservedStep || 0) - (b[1].lastObservedStep || 0));
    while (entries.length > MAX_VALUE_RECORDS) {
      const [key] = entries.shift();
      delete state.transitionValues[key];
    }
  }

  function learnOwnOutcomeValue(state, fromProposalKey, toProposalKey, direction, physicalProgress, ph) {
    if (!fromProposalKey || !toProposalKey || fromProposalKey === toProposalKey || !Number.isFinite(physicalProgress)) return null;
    const key = valueKey(fromProposalKey, toProposalKey);
    let record = state.transitionValues[key];
    if (!record) {
      record = state.transitionValues[key] = {
        fromProposalKey,
        toProposalKey,
        direction:{ x:Number(direction?.x) || 0, y:Number(direction?.y) || 0 },
        samples:0,
        totalPhysicalProgress:0,
        meanPhysicalProgress:0,
        lastPhysicalProgress:0,
        lastObservedStep:stepCount,
      };
      stats.learnedValueRecords++;
    }
    record.samples++;
    record.totalPhysicalProgress += physicalProgress;
    record.meanPhysicalProgress = record.totalPhysicalProgress / record.samples;
    record.lastPhysicalProgress = physicalProgress;
    record.direction = { x:Number(direction?.x) || 0, y:Number(direction?.y) || 0 };
    record.lastObservedStep = stepCount;
    record.learningWeight = ph.outcomeValueLearning;
    stats.updatedValueRecords++;
    pruneValues(state);
    return record;
  }

  function eligibleAlternatives(organism, state, pendingPlan) {
    const planningState = organism.bioV67;
    if (!planningState || !pendingPlan?.fromProposalKey) return [];
    const alternatives = [];
    for (const transition of Object.values(planningState.transitions || {})) {
      if (transition.fromProposalKey !== pendingPlan.fromProposalKey) continue;
      if ((transition.successes || 0) < 2 || Number(transition.confidence) < 0.65) continue;
      const key = valueKey(transition.fromProposalKey, transition.toProposalKey);
      const value = state.transitionValues[key];
      if (!value || (value.samples || 0) < MIN_VALUE_SAMPLES) continue;
      const length = Math.hypot(Number(transition.toDirection?.x) || 0, Number(transition.toDirection?.y) || 0);
      if (length < 1e-6) continue;
      alternatives.push({
        key,
        fromProposalKey:transition.fromProposalKey,
        toProposalKey:transition.toProposalKey,
        direction:{ x:transition.toDirection.x / length, y:transition.toDirection.y / length },
        confidence:Number(transition.confidence) || 0,
        transitionSuccesses:transition.successes || 0,
        samples:value.samples,
        meanPhysicalProgress:value.meanPhysicalProgress,
        lastPhysicalProgress:value.lastPhysicalProgress,
      });
    }
    alternatives.sort((a,b) => b.meanPhysicalProgress - a.meanPhysicalProgress || b.confidence - a.confidence || b.transitionSuccesses - a.transitionSuccesses);
    return alternatives;
  }

  function compareAndRevisePrivatePlan(id, organism, state) {
    const planningState = organism.bioV67;
    const pending = planningState?.pendingPlan;
    if (!pending) return null;
    const alternatives = eligibleAlternatives(organism, state, pending);
    if (alternatives.length < 2) {
      stats.insufficientAlternativeEvidence++;
      return null;
    }
    stats.counterfactualComparisons++;
    const best = alternatives[0];
    const runnerUp = alternatives[1];
    const margin = best.meanPhysicalProgress - runnerUp.meanPhysicalProgress;
    if (margin < MIN_BRANCH_VALUE_MARGIN) return null;

    const baselineProposalKey = pending.predictedProposalKey;
    const choice = {
      fromProposalKey:pending.fromProposalKey,
      chosenProposalKey:best.toProposalKey,
      baselineProposalKey,
      chosenMeanPhysicalProgress:best.meanPhysicalProgress,
      runnerUpProposalKey:runnerUp.toProposalKey,
      runnerUpMeanPhysicalProgress:runnerUp.meanPhysicalProgress,
      valueMargin:margin,
      alternatives:alternatives.map(item => ({
        toProposalKey:item.toProposalKey,
        samples:item.samples,
        meanPhysicalProgress:item.meanPhysicalProgress,
        confidence:item.confidence,
      })),
      sourceDecisionStep:pending.sourceDecisionStep,
      step:stepCount,
    };
    state.lastCounterfactualChoice = choice;
    stats.privateBranchChoices++;

    if (best.toProposalKey !== baselineProposalKey) {
      planningState.pendingPlan = {
        ...pending,
        predictedProposalKey:best.toProposalKey,
        predictedDirection:{ ...best.direction },
        confidence:best.confidence,
        transitionSuccesses:best.transitionSuccesses,
      };
      planningState.lastFormedPlan = {
        ...planningState.pendingPlan,
        predictedDirection:{ ...planningState.pendingPlan.predictedDirection },
      };
      state.lastPlanOverride = {
        fromProposalKey:pending.fromProposalKey,
        baselineProposalKey,
        chosenProposalKey:best.toProposalKey,
        chosenDirection:{ ...best.direction },
        valueMargin:margin,
        sourceDecisionStep:pending.sourceDecisionStep,
        step:stepCount,
      };
      stats.privatePlanOverrides++;
    } else {
      state.lastPlanOverride = {
        fromProposalKey:pending.fromProposalKey,
        baselineProposalKey,
        chosenProposalKey:best.toProposalKey,
        chosenDirection:{ ...best.direction },
        valueMargin:margin,
        sourceDecisionStep:pending.sourceDecisionStep,
        step:stepCount,
        overrideRequired:false,
      };
    }
    return choice;
  }

  function counterfactualStep() {
    let valueOrganisms = 0;
    let marginSum = 0;
    let marginCount = 0;

    for (const [id, organism] of motile.entries()) {
      const ph = phenotype(organism.genome);
      const state = ensureState(organism, ph);
      const decisionState = consensus.getDecision?.(id);
      const decision = decisionState?.lastLocalDecision || null;
      const applied = decisionState?.lastAppliedDecision || null;
      const freshDecision = decision && decision.step !== state.lastObservedDecisionStep;

      if (freshDecision) {
        const currentProgress = applied?.proposalKey === decision.proposalKey && applied?.applied
          ? Number(applied.directionalVelocityDelta) || 0
          : 0;
        if (state.lastObservedProposalKey) {
          learnOwnOutcomeValue(
            state,
            state.lastObservedProposalKey,
            decision.proposalKey,
            decision.direction,
            currentProgress,
            ph
          );
          stats.observedOwnDecisionTransitions++;
        }
        state.lastObservedDecisionStep = decision.step;
        state.lastObservedProposalKey = decision.proposalKey;
      }

      const pending = organism.bioV67?.pendingPlan;
      const alreadyCompared = state.lastCounterfactualChoice?.sourceDecisionStep === pending?.sourceDecisionStep;
      if (pending && !alreadyCompared) {
        const choice = compareAndRevisePrivatePlan(id, organism, state);
        if (choice) {
          marginSum += choice.valueMargin;
          marginCount++;
        }
      }

      if (Object.keys(state.transitionValues || {}).length) valueOrganisms++;
    }

    stepCount++;
    stats.steps = stepCount;
    stats.organismsWithPrivateValues = valueOrganisms;
    stats.meanChosenValueMargin = marginCount ? marginSum / marginCount : 0;
  }

  const previousStep = modules.step.bind(modules);
  modules.step = function v68PrivateCounterfactualSelectionStep(dt) {
    const result = previousStep(dt);
    accumulator += Number(dt) || 0;
    if (accumulator >= STEP_SECONDS) {
      accumulator = 0;
      counterfactualStep();
    }
    return result;
  };

  const api = {
    installed:true,
    getStats:() => ({
      ...stats,
      installed:true,
      version:'v68a-private-counterfactual-branch-selection',
      valuesLearnedFromOwnV66PhysicalOutcomesOnly:true,
      comparesOnlyOwnV67EligibleTransitions:true,
      counterfactualChoiceRequiresMultipleExperiencedAlternatives:true,
      privatePendingPlanRevisionOnly:true,
      noOtherOrganismValueInspection:true,
      noSharedUtilityTable:true,
      noCentralObjectiveFunction:true,
      noGroupPlanRanking:true,
      branchPreferenceCanChangeWithOwnOutcomeEvidence:true,
      identicalTransitionKnowledgeCanYieldDifferentPrivateChoices:true,
      maxValueRecords:MAX_VALUE_RECORDS,
      minValueSamples:MIN_VALUE_SAMPLES,
      minBranchValueMargin:MIN_BRANCH_VALUE_MARGIN,
      authoritativeFixedStep:true,
      noHardPopulationCap:true,
      noHardDisplayCap:true,
      surfaceRendererEnabled:false,
    }),
    getCounterfactualState(id) {
      const state = motile.get(id)?.bioV68;
      if (!state) return null;
      return {
        counterfactualSensitivity:state.counterfactualSensitivity,
        outcomeValueLearning:state.outcomeValueLearning,
        transitionValues:Object.fromEntries(Object.entries(state.transitionValues || {}).map(([key, record]) => [key, {
          ...record,
          direction:{ ...record.direction },
        }])),
        lastObservedDecisionStep:state.lastObservedDecisionStep,
        lastObservedProposalKey:state.lastObservedProposalKey,
        lastCounterfactualChoice:state.lastCounterfactualChoice ? {
          ...state.lastCounterfactualChoice,
          alternatives:state.lastCounterfactualChoice.alternatives.map(item => ({ ...item })),
        } : null,
        lastPlanOverride:state.lastPlanOverride ? {
          ...state.lastPlanOverride,
          chosenDirection:{ ...state.lastPlanOverride.chosenDirection },
        } : null,
      };
    },
    getPopulationCounterfactuals() {
      return [...motile.entries()]
        .map(([id, organism]) => ({ id, lineageId:organism.lineageId, counterfactual:api.getCounterfactualState(id) }))
        .filter(item => item.counterfactual);
    },
  };

  window.realitySandboxCounterfactualBranchSelectionV68 = api;
  window.realitySandboxEvolutionBuild = 'evolution-v68-private-counterfactual-branch-selection';
  document.documentElement.dataset.evolutionBuild = 'evolution-v68-private-counterfactual-branch-selection';
  document.documentElement.dataset.counterfactualBranchSelectionV68 = 'private-outcome-ranked-alternatives';
}

waitForRuntime().then(install);
