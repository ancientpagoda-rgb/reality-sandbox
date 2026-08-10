async function waitForRuntime() {
  while (true) {
    const previous = window.realitySandboxEvolutionDiagnosticsV62;
    const jointAction = window.realitySandboxCoalitionJointActionV63;
    if (previous?.installed && jointAction?.installed) return { previous, jointAction };
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ previous, jointAction }) {
  if (window.realitySandboxEvolutionDiagnosticsV63?.installed) return;

  function snapshot() {
    return {
      ...previous.snapshot(),
      evolutionBuild:window.realitySandboxEvolutionBuild || 'unknown',
      coalitionJointAction:jointAction.getStats(),
      populationJointAction:jointAction.getPopulationJointAction(),
    };
  }

  function invariants() {
    const base = previous.invariants();
    const failures = [...(base?.failures || [])];
    const state = snapshot();
    const joint = state.coalitionJointAction || {};

    if (joint.version !== 'v63a-affiliation-conditioned-joint-action') failures.push(`Unexpected v63 joint-action version ${joint.version || 'unknown'}.`);
    if (!joint.usesObservableV56JointAttentionOnly || !joint.usesOwnV62AffiliationOnly) failures.push('The v63 observable-input/own-affiliation contract is incomplete.');
    if (!joint.noReverseAffiliationInspection || !joint.noCoalitionMembershipLookup || !joint.noHiddenTargetCoordinates) failures.push('The v63 private-state/no-membership boundary is incomplete.');
    if (!joint.sustainedResponseAfterPublicSignal || !joint.weakAffiliationPreservesV56Behavior || !joint.urgentLocalNeedsOverrideCommitment) failures.push('The v63 response-composition contract is incomplete.');
    if (!joint.oneBoundedCommitmentPerOrganism || joint.maxCommitmentSteps !== 6) failures.push('The v63 bounded commitment contract is invalid.');
    if (Math.abs((joint.affiliationThreshold || 0) - 0.30) > 1e-12 || Math.abs((joint.evidenceThreshold || 0) - 0.18) > 1e-12) failures.push('The v63 affiliation/evidence thresholds changed unexpectedly.');
    if (!joint.authoritativeFixedStep || !joint.noHardPopulationCap || !joint.noHardDisplayCap || joint.surfaceRendererEnabled) failures.push('The v63 fixed-step/cap/renderer contract failed.');

    for (const item of state.populationJointAction || []) {
      const action = item.jointAction || {};
      if ('coalitionId' in action || 'groupId' in action || 'membership' in action || 'groupPlan' in action) failures.push(`Organism ${item.id} stores explicit group-command state in v63.`);
      const commitment = action.commitment;
      if (commitment) {
        if ('target' in commitment || 'targetX' in commitment || 'targetY' in commitment || 'coalitionId' in commitment || 'groupId' in commitment || 'membership' in commitment) failures.push(`Organism ${item.id} stores hidden target/group data in its v63 commitment.`);
        if (!Number.isFinite(commitment.speakerId)) failures.push(`Organism ${item.id} has a v63 commitment without a physical speaker.`);
        if (!Number.isFinite(commitment.totalSteps) || commitment.totalSteps < 1 || commitment.totalSteps > 6) failures.push(`Organism ${item.id} exceeded the v63 commitment-duration bound.`);
        if (!Number.isFinite(commitment.remainingSteps) || commitment.remainingSteps < 0 || commitment.remainingSteps > commitment.totalSteps) failures.push(`Organism ${item.id} has invalid v63 remaining commitment time.`);
        const dx = Number(commitment.direction?.x);
        const dy = Number(commitment.direction?.y);
        const mag = Math.hypot(dx, dy);
        if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(mag - 1) > 1e-6) failures.push(`Organism ${item.id} has invalid observable steering direction in v63.`);
      }
      const applied = action.lastAppliedCommitment;
      if (applied && !applied.interrupted) {
        if (!Number.isFinite(applied.directionalVelocityBefore) || !Number.isFinite(applied.directionalVelocityAfter) || !Number.isFinite(applied.directionalVelocityDelta)) failures.push(`Organism ${item.id} lacks finite v63 physical steering diagnostics.`);
      }
    }

    return { ok:failures.length === 0, failures, snapshot:state };
  }

  const api = { installed:true, snapshot, invariants };
  window.realitySandboxEvolutionDiagnosticsV63 = api;
  window.realitySandboxEvolutionDiagnosticsV48d = api;
  document.documentElement.dataset.evolutionDiagnosticsV63 = 'ready-coalition-joint-action';

  if (window.realitySandboxDebug && typeof window.realitySandboxDebug === 'object') {
    window.realitySandboxDebug.evolution = snapshot;
    window.realitySandboxDebug.evolutionInvariants = invariants;
  }

  const previousPresentationDiagnostics = window.realitySandboxPresentationDiagnostics;
  window.realitySandboxPresentationDiagnostics = () => ({
    ...(typeof previousPresentationDiagnostics === 'function' ? previousPresentationDiagnostics() : {}),
    evolutionV63:snapshot(),
  });
}

waitForRuntime().then(install);
