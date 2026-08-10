async function waitForRuntime() {
  while (true) {
    const previous = window.realitySandboxEvolutionDiagnosticsV66;
    const planning = window.realitySandboxDistributedPlanningV67;
    const planet = window.realitySandboxPlanet;
    const motile = planet?.world?.ecs?.components?.motile;
    if (previous?.installed && planning?.installed && motile instanceof Map) {
      return { previous, planning, motile };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ previous, planning, motile }) {
  if (window.realitySandboxEvolutionDiagnosticsV67?.installed) return;

  function snapshot() {
    return {
      ...previous.snapshot(),
      evolutionBuild:window.realitySandboxEvolutionBuild || 'unknown',
      distributedPlanning:planning.getStats(),
      populationPlans:planning.getPopulationPlans(),
    };
  }

  function validUnitDirection(direction) {
    const x = Number(direction?.x);
    const y = Number(direction?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    return Math.abs(Math.hypot(x, y) - 1) <= 1e-6;
  }

  function validatePlanRecord(id, label, plan, failures) {
    if (!plan) return;
    if (typeof plan.fromProposalKey !== 'string' || !plan.fromProposalKey || typeof plan.predictedProposalKey !== 'string' || !plan.predictedProposalKey) failures.push(`Organism ${id} has invalid ${label} proposal keys.`);
    if (!validUnitDirection(plan.predictedDirection)) failures.push(`Organism ${id} has invalid ${label} predicted direction.`);
    if (!Number.isFinite(plan.confidence) || plan.confidence < 0.65 || plan.confidence > 1) failures.push(`Organism ${id} has invalid ${label} confidence.`);
    if (!Number.isInteger(plan.transitionSuccesses) || plan.transitionSuccesses < 2) failures.push(`Organism ${id} has invalid ${label} transition evidence.`);
    if (!Number.isInteger(plan.sourceDecisionStep) || !Number.isInteger(plan.formedAtStep) || !Number.isInteger(plan.executeAfterStep) || plan.executeAfterStep !== plan.formedAtStep + 1) failures.push(`Organism ${id} has invalid ${label} cadence accounting.`);
  }

  function invariants() {
    const base = previous.invariants();
    const failures = [...(base?.failures || [])];
    const state = snapshot();
    const plan = state.distributedPlanning || {};

    if (state.evolutionBuild !== 'evolution-v67-distributed-multistep-planning') failures.push(`Unexpected evolution build ${state.evolutionBuild || 'unknown'}.`);
    if (plan.version !== 'v67a-private-transition-planning') failures.push(`Unexpected v67 planning version ${plan.version || 'unknown'}.`);
    if (!plan.learnsOnlyFromOwnV66DecisionSequence || !plan.transitionEvidenceRequiresOwnPhysicalProgress) failures.push('The v67 own-sequence/physical-evidence contract is incomplete.');
    if (!plan.plansStoredPerOrganismOnly || !plan.plansPredictOneBoundedFutureStep || !plan.freshPublicDecisionRevisesPendingPlan) failures.push('The v67 bounded private-planning contract is incomplete.');
    if (!plan.noOtherOrganismPlanInspection || !plan.noSharedPlanMemory || !plan.noCentralPlannerOrGroupGoal || !plan.noRouteAuthorityOrTaskAssignment) failures.push('The v67 no-central/shared-plan contract is incomplete.');
    if (!plan.privatePlansCanDivergeUnderIdenticalGenomes || !plan.prospectiveActionCanOccurWithoutSecondPublicSignal || !plan.lastFormedPlanObservable || !plan.detectedDangerOverridesPlan) failures.push('The v67 prospective-action contract is incomplete.');
    if (plan.maxTransitionRecords !== 12 || plan.minTransitionSuccesses !== 2 || Math.abs((plan.planConfidenceThreshold || 0) - 0.65) > 1e-12 || Math.abs((plan.minPriorPhysicalProgress || 0) - 0.08) > 1e-12) failures.push('The v67 transition/planning schema changed unexpectedly.');
    if (!plan.authoritativeFixedStep || !plan.noHardPopulationCap || !plan.noHardDisplayCap || plan.surfaceRendererEnabled) failures.push('The v67 fixed-step/cap/renderer contract failed.');

    const forbidden = ['sharedPlan','groupPlan','groupGoal','planner','plannerId','leader','leaderId','authority','authorityId','routeAuthority','taskAssignment','taskAssignments','members','membership','sharedRoute','groupRoute','collectivePlan'];
    for (const [id, organism] of motile.entries()) {
      const raw = organism.bioV67;
      if (!raw) continue;
      for (const field of forbidden) {
        if (field in raw) failures.push(`Organism ${id} stores forbidden v67 shared-plan/authority field ${field}.`);
      }
      if (!Number.isFinite(raw.planningSensitivity) || raw.planningSensitivity < 0 || raw.planningSensitivity > 1) failures.push(`Organism ${id} has invalid v67 planning sensitivity.`);
      if (!Number.isFinite(raw.transitionLearning) || raw.transitionLearning < 0 || raw.transitionLearning > 1) failures.push(`Organism ${id} has invalid v67 transition learning.`);

      const transitions = Object.values(raw.transitions || {});
      if (transitions.length > 12) failures.push(`Organism ${id} exceeds the v67 transition-memory bound.`);
      for (const transition of transitions) {
        if (typeof transition.fromProposalKey !== 'string' || !transition.fromProposalKey || typeof transition.toProposalKey !== 'string' || !transition.toProposalKey || transition.fromProposalKey === transition.toProposalKey) failures.push(`Organism ${id} has invalid v67 transition keys.`);
        if (!validUnitDirection(transition.toDirection)) failures.push(`Organism ${id} has invalid v67 learned transition direction.`);
        if (!Number.isInteger(transition.successes) || transition.successes < 0 || !Number.isInteger(transition.failures) || transition.failures < 0) failures.push(`Organism ${id} has invalid v67 transition evidence counts.`);
        const trials = Math.max(1, (transition.successes || 0) + (transition.failures || 0));
        const expectedConfidence = (transition.successes || 0) / trials;
        if (!Number.isFinite(transition.confidence) || transition.confidence < 0 || transition.confidence > 1 || Math.abs(transition.confidence - expectedConfidence) > 1e-12) failures.push(`Organism ${id} has inconsistent v67 transition confidence.`);
      }

      validatePlanRecord(id, 'pending plan', raw.pendingPlan, failures);
      validatePlanRecord(id, 'last formed plan', raw.lastFormedPlan, failures);

      const applied = raw.lastPlanApplication;
      if (applied?.applied) {
        if (typeof applied.fromProposalKey !== 'string' || typeof applied.predictedProposalKey !== 'string') failures.push(`Organism ${id} has invalid v67 applied plan keys.`);
        if (!validUnitDirection(applied.direction)) failures.push(`Organism ${id} has invalid v67 applied direction.`);
        if (!Number.isFinite(applied.confidence) || applied.confidence < 0.65 || applied.confidence > 1) failures.push(`Organism ${id} has invalid v67 applied confidence.`);
        if (!Number.isFinite(applied.strength) || applied.strength < 0.08 || applied.strength > 0.20) failures.push(`Organism ${id} has invalid v67 applied steering strength.`);
        if (!Number.isFinite(applied.directionalVelocityBefore) || !Number.isFinite(applied.directionalVelocityAfter) || !Number.isFinite(applied.directionalVelocityDelta)) failures.push(`Organism ${id} has invalid v67 physical planning record.`);
      }
      if (applied?.interrupted && applied.reason !== 'detected-danger') failures.push(`Organism ${id} has invalid v67 interruption reason.`);
    }

    return { ok:failures.length === 0, failures, snapshot:state };
  }

  const api = { installed:true, snapshot, invariants };
  window.realitySandboxEvolutionDiagnosticsV67 = api;
  window.realitySandboxEvolutionDiagnosticsV48d = api;
  document.documentElement.dataset.evolutionDiagnosticsV67 = 'ready-distributed-multistep-planning';

  if (window.realitySandboxDebug && typeof window.realitySandboxDebug === 'object') {
    window.realitySandboxDebug.evolution = snapshot;
    window.realitySandboxDebug.evolutionInvariants = invariants;
  }

  const previousPresentationDiagnostics = window.realitySandboxPresentationDiagnostics;
  window.realitySandboxPresentationDiagnostics = () => ({
    ...(typeof previousPresentationDiagnostics === 'function' ? previousPresentationDiagnostics() : {}),
    evolutionV67:snapshot(),
  });
}

waitForRuntime().then(install);
