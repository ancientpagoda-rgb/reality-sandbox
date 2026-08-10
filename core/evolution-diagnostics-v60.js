async function waitForRuntime() {
  while (true) {
    const previous = window.realitySandboxEvolutionDiagnosticsV59;
    const indirect = window.realitySandboxIndirectReciprocityV60;
    const cooperation = window.realitySandboxReciprocalCooperationV58;
    if (previous?.installed && indirect?.installed && cooperation?.installed) return { previous, indirect, cooperation };
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ previous, indirect, cooperation }) {
  if (window.realitySandboxEvolutionDiagnosticsV60?.installed) return;

  function snapshot() {
    return {
      ...previous.snapshot(),
      evolutionBuild:window.realitySandboxEvolutionBuild || 'unknown',
      indirectReciprocity:indirect.getStats(),
    };
  }

  function invariants() {
    const actualBuild = window.realitySandboxEvolutionBuild;
    let base;
    try {
      window.realitySandboxEvolutionBuild = 'evolution-v59-public-reputation';
      base = previous.invariants();
    } finally {
      window.realitySandboxEvolutionBuild = actualBuild;
    }

    const failures = [...(base?.failures || [])];
    const state = snapshot();
    const ir = state.indirectReciprocity || {};
    const coop = cooperation.getStats?.() || {};

    if (actualBuild !== 'evolution-v60-indirect-reciprocity') failures.push(`Unexpected evolution build ${actualBuild || 'unknown'}.`);
    if (ir.version !== 'v60a-local-indirect-reciprocity') failures.push(`Unexpected v60 indirect-reciprocity version ${ir.version || 'unknown'}.`);
    if (!ir.ownWitnessedReputationOnly || !ir.reputationEvidenceFromV59Only || !ir.noGlobalReputationLookup) failures.push('The v60 local reputation-evidence contract is incomplete.');
    if (!ir.noBorrowedPrivateLedgers || !ir.noHiddenRecipientNeedInspection || !ir.noEvidencePreservesV58Score) failures.push('The v60 privacy/pass-through contract is incomplete.');
    if (!ir.boundedReputationInput || !ir.aidRankingOnly || !ir.v58ConservedTransferPreserved) failures.push('The v60 indirect-aid boundary is incomplete.');
    if (!ir.authoritativeFixedStep || !ir.noHardPopulationCap || !ir.noHardDisplayCap || ir.surfaceRendererEnabled) failures.push('The v60 fixed-step/cap/renderer contract failed.');
    if (!coop.aidRequestScoreModifierSupported || !coop.aidRequestScoreModifierInstalled) failures.push('The v58 generic aid-score extension seam is inactive.');

    const aidBalance = Math.abs(
      (coop.energyDebited || 0) - (coop.energyReceived || 0) - (coop.metabolicAidCost || 0)
    );
    if (aidBalance > 1e-8) failures.push(`The conserved v58 aid ledger changed under v60 (${aidBalance}).`);

    return { ok:failures.length === 0, failures, snapshot:state };
  }

  const api = { installed:true, snapshot, invariants };
  window.realitySandboxEvolutionDiagnosticsV60 = api;
  window.realitySandboxEvolutionDiagnosticsV48d = api;
  document.documentElement.dataset.evolutionDiagnosticsV60 = 'ready-local-indirect-reciprocity';

  if (window.realitySandboxDebug && typeof window.realitySandboxDebug === 'object') {
    window.realitySandboxDebug.evolution = snapshot;
    window.realitySandboxDebug.evolutionInvariants = invariants;
  }

  const previousPresentationDiagnostics = window.realitySandboxPresentationDiagnostics;
  window.realitySandboxPresentationDiagnostics = () => ({
    ...(typeof previousPresentationDiagnostics === 'function' ? previousPresentationDiagnostics() : {}),
    evolutionV60:snapshot(),
  });
}

waitForRuntime().then(install);
