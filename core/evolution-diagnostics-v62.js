async function waitForRuntime() {
  while (true) {
    const previous = window.realitySandboxEvolutionDiagnosticsV61;
    const coalitions = window.realitySandboxProtoCoalitionsV62;
    const cooperation = window.realitySandboxReciprocalCooperationV58;
    if (previous?.installed && coalitions?.installed && cooperation?.installed) return { previous, coalitions, cooperation };
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ previous, coalitions, cooperation }) {
  if (window.realitySandboxEvolutionDiagnosticsV62?.installed) return;

  function snapshot() {
    return {
      ...previous.snapshot(),
      evolutionBuild:window.realitySandboxEvolutionBuild || 'unknown',
      protoCoalitions:coalitions.getStats(),
      coalitionGraph:coalitions.getCoalitionGraph(),
    };
  }

  function invariants() {
    const base = previous.invariants();
    const failures = [...(base?.failures || [])];
    const state = snapshot();
    const c = state.protoCoalitions || {};
    const graph = state.coalitionGraph || { edges:[], components:[] };
    const coop = cooperation.getStats?.() || {};

    if (c.version !== 'v62a-mutual-affiliation-networks') failures.push(`Unexpected v62 coalition version ${c.version || 'unknown'}.`);
    if (!c.agentsUseOwnEvidenceOnly || !c.noPrivateAffiliationInspectionForBehavior) failures.push('The v62 own-evidence/private-state boundary is incomplete.');
    if (!c.directCooperationEvidence || !c.communicationOutcomeEvidence || !c.witnessedPublicBehaviorEvidence) failures.push('The v62 affiliation evidence-source contract is incomplete.');
    if (!c.noExplicitGroupIdentity || !c.noStoredCoalitionMembership || !c.coalitionDerivedFromMutualAffiliation) failures.push('The v62 emergent coalition-identity contract is incomplete.');
    if (!c.oneSidedAffinityDoesNotCreateCoalition || !c.affiliationBiasesAudienceSelection) failures.push('The v62 mutuality/behavior contract is incomplete.');
    if (!c.boundedAffiliationMemory || c.maxAffiliations !== 8 || Math.abs((c.mutualBondThreshold || 0) - 0.36) > 1e-12) failures.push('The v62 bounded affiliation schema is invalid.');
    if (!c.evidenceRequiresPriorLocalSocialExperience || !c.authoritativeFixedStep || !c.noHardPopulationCap || !c.noHardDisplayCap || c.surfaceRendererEnabled) failures.push('The v62 locality/fixed-step/cap/renderer contract failed.');

    for (const item of coalitions.getPopulationAffiliations?.() || []) {
      const affiliation = item.affiliation || {};
      if ('coalitionId' in affiliation || 'groupId' in affiliation || 'membership' in affiliation) failures.push(`Organism ${item.id} stores explicit coalition identity.`);
      if (Object.keys(affiliation.affiliations || {}).length > 8) failures.push(`Organism ${item.id} exceeded the v62 affiliation-memory bound.`);
    }
    for (const edge of graph.edges || []) {
      if (!Number.isFinite(edge.a) || !Number.isFinite(edge.b) || edge.a === edge.b) failures.push('The v62 coalition graph contains an invalid mutual edge.');
      if ((Number(edge.strength) || 0) < 0.36) failures.push('The v62 coalition graph contains an edge below the mutual bond threshold.');
    }

    const aidBalance = Math.abs(
      (coop.energyDebited || 0) - (coop.energyReceived || 0) - (coop.metabolicAidCost || 0)
    );
    if (aidBalance > 1e-8) failures.push(`The conserved v58 aid ledger changed under v62 (${aidBalance}).`);

    return { ok:failures.length === 0, failures, snapshot:state };
  }

  const api = { installed:true, snapshot, invariants };
  window.realitySandboxEvolutionDiagnosticsV62 = api;
  window.realitySandboxEvolutionDiagnosticsV48d = api;
  document.documentElement.dataset.evolutionDiagnosticsV62 = 'ready-proto-coalitions';

  if (window.realitySandboxDebug && typeof window.realitySandboxDebug === 'object') {
    window.realitySandboxDebug.evolution = snapshot;
    window.realitySandboxDebug.evolutionInvariants = invariants;
  }

  const previousPresentationDiagnostics = window.realitySandboxPresentationDiagnostics;
  window.realitySandboxPresentationDiagnostics = () => ({
    ...(typeof previousPresentationDiagnostics === 'function' ? previousPresentationDiagnostics() : {}),
    evolutionV62:snapshot(),
  });
}

waitForRuntime().then(install);
