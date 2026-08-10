const STEP_SECONDS = 0.9;
const MAX_TRANSITIONS = 12;
const MIN_TRANSITION_SUCCESSES = 2;
const PLAN_CONFIDENCE_THRESHOLD = 0.65;
const MIN_PRIOR_PHYSICAL_PROGRESS = 0.08;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number(v) || 0));

async function waitForRuntime() {
  while (true) {
    const consensus = window.realitySandboxDistributedConsensusV66;
    const planet = window.realitySandboxPlanet;
    const modules = window.realitySandboxModules;
    const c = planet?.world?.ecs?.components;
    if (consensus?.installed && modules?.step && c?.motile instanceof Map && c?.velocity instanceof Map) {
      return { consensus, planet, modules };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ consensus, planet, modules }) {
  if (window.realitySandboxDistributedPlanningV67?.installed) return;

  const { motile, velocity } = planet.world.ecs.components;
  let accumulator = 0;
  let stepCount = 0;

  const stats = {
    steps:0,
    observedDecisionEvents:0,
    learnedTransitions:0,
    strengthenedTransitions:0,
    plansFormed:0,
    plansRevisedByFreshDecision:0,
    plansApplied:0,
    dangerOverrides:0,
    activePrivatePlans:0,
    organismsWithTransitionMemory:0,
    meanPlanConfidence:0,
  };

  function phenotype(g = {}) {
    const brain = clamp(g.brainSpeed);
    const sociality = clamp(g.sociality);
    const sense = clamp(g.sense);
    const motility = clamp(g.motility);
    return {
      planningSensitivity:clamp(0.08 + brain * 0.42 + sociality * 0.28 + sense * 0.12),
      transitionLearning:clamp(0.10 + brain * 0.38 + sense * 0.22 + sociality * 0.18),
      locomotorSpeed:7 + motility * 36,
    };
  }

  function ensureState(organism, ph) {
    if (!organism.bioV67) {
      organism.bioV67 = {
        planningSensitivity:ph.planningSensitivity,
        transitionLearning:ph.transitionLearning,
        transitions:{},
        lastObservedDecisionStep:null,
        lastObservedProposalKey:null,
        lastObservedDirection:null,
        lastObservedAppliedDelta:0,
        pendingPlan:null,
        lastPlanApplication:null,
      };
    }
    organism.bioV67.planningSensitivity = ph.planningSensitivity;
    organism.bioV67.transitionLearning = ph.transitionLearning;
    return organism.bioV67;
  }

  function transitionKey(fromProposalKey, toProposalKey) {
    return `${fromProposalKey}>${toProposalKey}`;
  }

  function transitionConfidence(record) {
    const trials = Math.max(1, (record.successes || 0) + (record.failures || 0));
    return clamp((record.successes || 0) / trials);
  }

  function pruneTransitions(state) {
    const records = Object.entries(state.transitions || {});
    if (records.length <= MAX_TRANSITIONS) return;
    records.sort((a,b) => {
      const ac = transitionConfidence(a[1]);
      const bc = transitionConfidence(b[1]);
      return ac - bc || (a[1].lastObservedStep || 0) - (b[1].lastObservedStep || 0);
    });
    while (records.length > MAX_TRANSITIONS) {
      const [key] = records.shift();
      delete state.transitions[key];
    }
  }

  function learnTransition(state, from, to, previousDelta, currentDelta, ph) {
    if (!from?.proposalKey || !to?.proposalKey || from.proposalKey === to.proposalKey) return null;
    const key = transitionKey(from.proposalKey, to.proposalKey);
    let record = state.transitions[key];
    if (!record) {
      record = state.transitions[key] = {
        fromProposalKey:from.proposalKey,
        toProposalKey:to.proposalKey,
        toDirection:{ x:Number(to.direction?.x) || 0, y:Number(to.direction?.y) || 0 },
        successes:0,
        failures:0,
        confidence:0,
        lastObservedStep:stepCount,
      };
      stats.learnedTransitions++;
    }
    const physicallySupported = previousDelta > MIN_PRIOR_PHYSICAL_PROGRESS && currentDelta > MIN_PRIOR_PHYSICAL_PROGRESS;
    if (physicallySupported) record.successes++;
    else record.failures++;
    record.toDirection = { x:Number(to.direction?.x) || 0, y:Number(to.direction?.y) || 0 };
    record.confidence = transitionConfidence(record);
    record.lastObservedStep = stepCount;
    record.learningWeight = ph.transitionLearning;
    stats.strengthenedTransitions++;
    pruneTransitions(state);
    return record;
  }

  function bestTransition(state, fromProposalKey) {
    let best = null;
    for (const record of Object.values(state.transitions || {})) {
      if (record.fromProposalKey !== fromProposalKey) continue;
      if ((record.successes || 0) < MIN_TRANSITION_SUCCESSES || record.confidence < PLAN_CONFIDENCE_THRESHOLD) continue;
      if (!best || record.confidence > best.confidence || (record.confidence === best.confidence && record.successes > best.successes)) best = record;
    }
    return best;
  }

  function urgentDanger(organism) {
    const brain = organism.bioV50 || {};
    return brain.mode === 'flee' || Number.isFinite(brain.detectedDanger);
  }

  function formPlan(state, decision, appliedDelta) {
    const transition = bestTransition(state, decision.proposalKey);
    if (!transition || appliedDelta <= MIN_PRIOR_PHYSICAL_PROGRESS) return null;
    const length = Math.hypot(Number(transition.toDirection?.x) || 0, Number(transition.toDirection?.y) || 0);
    if (length < 1e-6) return null;
    const plan = {
      fromProposalKey:decision.proposalKey,
      predictedProposalKey:transition.toProposalKey,
      predictedDirection:{ x:transition.toDirection.x / length, y:transition.toDirection.y / length },
      confidence:transition.confidence,
      transitionSuccesses:transition.successes,
      sourceDecisionStep:decision.step,
      formedAtStep:stepCount,
      executeAfterStep:stepCount + 1,
    };
    state.pendingPlan = plan;
    stats.plansFormed++;
    return plan;
  }

  function applyPlan(id, organism, state, ph) {
    const plan = state.pendingPlan;
    if (!plan || stepCount < plan.executeAfterStep) return false;
    if (urgentDanger(organism)) {
      state.lastPlanApplication = {
        fromProposalKey:plan.fromProposalKey,
        predictedProposalKey:plan.predictedProposalKey,
        applied:false,
        interrupted:true,
        reason:'detected-danger',
        step:stepCount,
      };
      state.pendingPlan = null;
      stats.dangerOverrides++;
      return false;
    }
    const vel = velocity.get(id);
    if (!vel) {
      state.pendingPlan = null;
      return false;
    }
    const direction = plan.predictedDirection;
    const strength = clamp(0.08 + plan.confidence * (0.07 + ph.planningSensitivity * 0.05), 0.08, 0.20);
    const blend = 1 - strength;
    const speed = ph.locomotorSpeed * (0.38 + ph.planningSensitivity * 0.10);
    const before = { vx:vel.vx, vy:vel.vy };
    const beforeDirectional = before.vx * direction.x + before.vy * direction.y;
    vel.vx = vel.vx * blend + direction.x * speed * strength;
    vel.vy = vel.vy * blend + direction.y * speed * strength;
    const after = { vx:vel.vx, vy:vel.vy };
    const afterDirectional = after.vx * direction.x + after.vy * direction.y;
    state.lastPlanApplication = {
      fromProposalKey:plan.fromProposalKey,
      predictedProposalKey:plan.predictedProposalKey,
      direction:{ ...direction },
      confidence:plan.confidence,
      strength,
      velocityBefore:before,
      velocityAfter:after,
      directionalVelocityBefore:beforeDirectional,
      directionalVelocityAfter:afterDirectional,
      directionalVelocityDelta:afterDirectional - beforeDirectional,
      applied:true,
      interrupted:false,
      step:stepCount,
    };
    state.pendingPlan = null;
    stats.plansApplied++;
    return true;
  }

  function planningStep() {
    let activePlans = 0;
    let transitionOrganisms = 0;
    let confidenceSum = 0;
    let confidenceCount = 0;

    for (const [id, organism] of motile.entries()) {
      const ph = phenotype(organism.genome);
      const state = ensureState(organism, ph);
      const current = consensus.getDecision?.(id);
      const decision = current?.lastLocalDecision || null;
      const applied = current?.lastAppliedDecision || null;
      const freshDecision = decision && decision.step !== state.lastObservedDecisionStep;

      if (freshDecision) {
        stats.observedDecisionEvents++;
        if (state.pendingPlan) {
          state.pendingPlan = null;
          stats.plansRevisedByFreshDecision++;
        }

        const currentAppliedDelta = applied?.proposalKey === decision.proposalKey && applied?.applied
          ? Number(applied.directionalVelocityDelta) || 0
          : 0;
        const previous = state.lastObservedProposalKey ? {
          proposalKey:state.lastObservedProposalKey,
          direction:state.lastObservedDirection,
        } : null;
        if (previous) {
          learnTransition(
            state,
            previous,
            decision,
            Number(state.lastObservedAppliedDelta) || 0,
            currentAppliedDelta,
            ph
          );
        }

        state.lastObservedDecisionStep = decision.step;
        state.lastObservedProposalKey = decision.proposalKey;
        state.lastObservedDirection = decision.direction ? { ...decision.direction } : null;
        state.lastObservedAppliedDelta = currentAppliedDelta;
        formPlan(state, decision, currentAppliedDelta);
      } else if (state.pendingPlan) {
        const stillOnSourceDecision = decision?.proposalKey === state.pendingPlan.fromProposalKey && decision?.step === state.pendingPlan.sourceDecisionStep;
        if (stillOnSourceDecision) applyPlan(id, organism, state, ph);
        else {
          state.pendingPlan = null;
          stats.plansRevisedByFreshDecision++;
        }
      }

      const records = Object.values(state.transitions || {});
      if (records.length) transitionOrganisms++;
      if (state.pendingPlan) {
        activePlans++;
        confidenceSum += state.pendingPlan.confidence;
        confidenceCount++;
      }
    }

    stepCount++;
    stats.steps = stepCount;
    stats.activePrivatePlans = activePlans;
    stats.organismsWithTransitionMemory = transitionOrganisms;
    stats.meanPlanConfidence = confidenceCount ? confidenceSum / confidenceCount : 0;
  }

  const previousStep = modules.step.bind(modules);
  modules.step = function v67DistributedPlanningStep(dt) {
    const result = previousStep(dt);
    accumulator += Number(dt) || 0;
    if (accumulator >= STEP_SECONDS) {
      accumulator = 0;
      planningStep();
    }
    return result;
  };

  const api = {
    installed:true,
    getStats:() => ({
      ...stats,
      installed:true,
      version:'v67a-private-transition-planning',
      learnsOnlyFromOwnV66DecisionSequence:true,
      transitionEvidenceRequiresOwnPhysicalProgress:true,
      plansStoredPerOrganismOnly:true,
      plansPredictOneBoundedFutureStep:true,
      freshPublicDecisionRevisesPendingPlan:true,
      noOtherOrganismPlanInspection:true,
      noSharedPlanMemory:true,
      noCentralPlannerOrGroupGoal:true,
      noRouteAuthorityOrTaskAssignment:true,
      privatePlansCanDivergeUnderIdenticalGenomes:true,
      prospectiveActionCanOccurWithoutSecondPublicSignal:true,
      detectedDangerOverridesPlan:true,
      maxTransitionRecords:MAX_TRANSITIONS,
      minTransitionSuccesses:MIN_TRANSITION_SUCCESSES,
      planConfidenceThreshold:PLAN_CONFIDENCE_THRESHOLD,
      minPriorPhysicalProgress:MIN_PRIOR_PHYSICAL_PROGRESS,
      authoritativeFixedStep:true,
      noHardPopulationCap:true,
      noHardDisplayCap:true,
      surfaceRendererEnabled:false,
    }),
    getPlan(id) {
      const state = motile.get(id)?.bioV67;
      if (!state) return null;
      return {
        planningSensitivity:state.planningSensitivity,
        transitionLearning:state.transitionLearning,
        transitions:Object.fromEntries(Object.entries(state.transitions || {}).map(([key, record]) => [key, {
          ...record,
          toDirection:{ ...record.toDirection },
        }])),
        lastObservedDecisionStep:state.lastObservedDecisionStep,
        lastObservedProposalKey:state.lastObservedProposalKey,
        pendingPlan:state.pendingPlan ? {
          ...state.pendingPlan,
          predictedDirection:{ ...state.pendingPlan.predictedDirection },
        } : null,
        lastPlanApplication:state.lastPlanApplication ? {
          ...state.lastPlanApplication,
          direction:state.lastPlanApplication.direction ? { ...state.lastPlanApplication.direction } : undefined,
          velocityBefore:state.lastPlanApplication.velocityBefore ? { ...state.lastPlanApplication.velocityBefore } : undefined,
          velocityAfter:state.lastPlanApplication.velocityAfter ? { ...state.lastPlanApplication.velocityAfter } : undefined,
        } : null,
      };
    },
    getPopulationPlans() {
      return [...motile.entries()]
        .map(([id, organism]) => ({ id, lineageId:organism.lineageId, plan:api.getPlan(id) }))
        .filter(item => item.plan);
    },
  };

  window.realitySandboxDistributedPlanningV67 = api;
  window.realitySandboxEvolutionBuild = 'evolution-v67-distributed-multistep-planning';
  document.documentElement.dataset.evolutionBuild = 'evolution-v67-distributed-multistep-planning';
  document.documentElement.dataset.distributedPlanningV67 = 'private-prospective-plans';
}

waitForRuntime().then(install);
