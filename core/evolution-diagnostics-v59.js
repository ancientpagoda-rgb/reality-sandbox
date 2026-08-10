async function waitForRuntime() {
  while (true) {
    const previous = window.realitySandboxEvolutionDiagnosticsV48d;
    const reputation = window.realitySandboxPublicReputationV59;
    if (previous?.installed && reputation?.installed) return { previous, reputation };
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ previous, reputation }) {
  if (window.realitySandboxEvolutionDiagnosticsV59?.installed) return;

  function snapshot() {
    return {
      ...previous.snapshot(),
      evolutionBuild:window.realitySandboxEvolutionBuild || 'unknown',
      publicReputation:reputation.getStats(),
    };
  }

  function invariants() {
    // v48d predates v59 and intentionally pins its own latest-known build to v58.
    // Run those historical invariants against their expected marker, then restore
    // the actual active build before adding v59 checks.
    const actualBuild = window.realitySandboxEvolutionBuild;
    let base;
    try {
      window.realitySandboxEvolutionBuild = 'evolution-v58-reciprocal-cooperation';
      base = previous.invariants();
    } finally {
      window.realitySandboxEvolutionBuild = actualBuild;
    }

    const failures = [...(base?.failures || [])];
    const state = snapshot();
    const rep = state.publicReputation || {};
    if (actualBuild !== 'evolution-v59-public-reputation') failures.push(`Unexpected evolution build ${actualBuild || 'unknown'}.`);
    if (rep.version !== 'v59a-local-witnessed-reputation') failures.push(`Unexpected v59 reputation version ${rep.version || 'unknown'}.`);
    if (!rep.reputationFromPublicAidOnly || !rep.thirdPartyWitnessRequired || !rep.localSensoryWitnessRequired) failures.push('The v59 public-witness evidence contract is incomplete.');
    if (!rep.noGlobalReputationRegistry || !rep.observersCanDisagree || !rep.noHiddenAidAmount || !rep.noPrivateLedgerInspectionByAgents) failures.push('The v59 privacy/local-model contract is incomplete.');
    if (!rep.reputationBiasesAudienceSelection || !rep.boundedReputationMemory || rep.maxReputationEntries !== 8) failures.push('The v59 bounded reputation/behavior contract is incomplete.');
    if (!rep.spatialHashing || !rep.authoritativeFixedStep) failures.push('The v59 reputation subsystem is outside the fixed-step/spatial-hash contract.');
    if (!rep.noHardPopulationCap || !rep.noHardDisplayCap || rep.surfaceRendererEnabled) failures.push('The v59 cap/renderer invariants failed.');
    return { ok:failures.length === 0, failures, snapshot:state };
  }

  const api = { installed:true, snapshot, invariants };
  window.realitySandboxEvolutionDiagnosticsV59 = api;
  // Keep the historical name pointing at the newest aggregate diagnostics so
  // older smoke scripts automatically inherit the additional v59 checks.
  window.realitySandboxEvolutionDiagnosticsV48d = api;
  document.documentElement.dataset.evolutionDiagnosticsV59 = 'ready-local-public-reputation';

  if (window.realitySandboxDebug && typeof window.realitySandboxDebug === 'object') {
    window.realitySandboxDebug.evolution = snapshot;
    window.realitySandboxDebug.evolutionInvariants = invariants;
  }

  const previousPresentationDiagnostics = window.realitySandboxPresentationDiagnostics;
  window.realitySandboxPresentationDiagnostics = () => ({
    ...(typeof previousPresentationDiagnostics === 'function' ? previousPresentationDiagnostics() : {}),
    evolutionV59:snapshot(),
  });
}

waitForRuntime().then(install);