async function waitForRuntime() {
  while (true) {
    const previous = window.realitySandboxEvolutionDiagnosticsV60;
    const norms = window.realitySandboxLocalSocialNormsV61;
    const cooperation = window.realitySandboxReciprocalCooperationV58;
    if (previous?.installed && norms?.installed && cooperation?.installed) return { previous, norms, cooperation };
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ previous, norms, cooperation }) {
  if (window.realitySandboxEvolutionDiagnosticsV61?.installed) return;

  function snapshot() {
    return {
      ...previous.snapshot(),
      evolutionBuild:window.realitySandboxEvolutionBuild || 'unknown',
      localSocialNorms:norms.getStats(),
    };
  }

  function invariants() {
    const base = previous.invariants();
    const failures = [...(base?.failures || [])];
    const state = snapshot();
    const local = state.localSocialNorms || {};
    const coop = cooperation.getStats?.() || {};

    if (state.evolutionBuild !== 'evolution-v61-local-social-norms') failures.push(`Unexpected evolution build ${state.evolutionBuild || 'unknown'}.`);
    if (local.version !== 'v61a-local-answered-request-norms') failures.push(`Unexpected v61 local-norm version ${local.version || 'unknown'}.`);
    if (!local.normFromPublicRequestsAndAidOnly || !local.unansweredRequestsAreGroupEvidence || !local.noIndividualRefusalAttribution) failures.push('The v61 public group-evidence contract is incomplete.');
    if (!local.publicRequestStreamHidesNeedMagnitude || !local.differentGroupsCanLearnDifferentNorms) failures.push('The v61 locality/privacy norm contract is incomplete.');
    if (!local.noEvidencePreservesV60Score || !local.normsAffectAidWillingness || !local.v60IndirectReciprocityPreserved) failures.push('The v61 v60-composition contract is incomplete.');
    if (!local.v58ConservedTransferPreserved || !local.boundedPendingRequestMemory || local.maxPendingRequests !== 6 || local.requestResolutionSteps !== 2) failures.push('The v61 conservation/memory contract is incomplete.');
    if (!local.authoritativeFixedStep || !local.noHardPopulationCap || !local.noHardDisplayCap || local.surfaceRendererEnabled) failures.push('The v61 fixed-step/cap/renderer contract failed.');

    if (!coop.publicSolicitationEventStream || !coop.publicSolicitationHidesNeedMagnitude || coop.maxPublicSolicitationEvents !== 32) failures.push('The bounded v58 public-request evidence stream is incomplete.');
    if (!coop.aidRequestScoreModifierSupported || !coop.aidRequestScoreModifierInstalled) failures.push('The composed aid-score extension seam is inactive under v61.');
    const aidBalance = Math.abs(
      (coop.energyDebited || 0) - (coop.energyReceived || 0) - (coop.metabolicAidCost || 0)
    );
    if (aidBalance > 1e-8) failures.push(`The conserved v58 aid ledger changed under v61 (${aidBalance}).`);

    return { ok:failures.length === 0, failures, snapshot:state };
  }

  const api = { installed:true, snapshot, invariants };
  window.realitySandboxEvolutionDiagnosticsV61 = api;
  window.realitySandboxEvolutionDiagnosticsV48d = api;
  document.documentElement.dataset.evolutionDiagnosticsV61 = 'ready-local-social-norms';

  if (window.realitySandboxDebug && typeof window.realitySandboxDebug === 'object') {
    window.realitySandboxDebug.evolution = snapshot;
    window.realitySandboxDebug.evolutionInvariants = invariants;
  }

  const previousPresentationDiagnostics = window.realitySandboxPresentationDiagnostics;
  window.realitySandboxPresentationDiagnostics = () => ({
    ...(typeof previousPresentationDiagnostics === 'function' ? previousPresentationDiagnostics() : {}),
    evolutionV61:snapshot(),
  });
}

waitForRuntime().then(install);
