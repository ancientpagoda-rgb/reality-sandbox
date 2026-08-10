async function waitForRuntime() {
  while (true) {
    const previous = window.realitySandboxEvolutionDiagnosticsV64;
    const influence = window.realitySandboxSituationalInfluenceV65;
    const jointAction = window.realitySandboxCoalitionJointActionV63;
    const planet = window.realitySandboxPlanet;
    const motile = planet?.world?.ecs?.components?.motile;
    if (previous?.installed && influence?.installed && jointAction?.installed && motile instanceof Map) {
      return { previous, influence, jointAction, motile };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ previous, influence, jointAction, motile }) {
  if (window.realitySandboxEvolutionDiagnosticsV65?.installed) return;

  function snapshot() {
    return {
      ...previous.snapshot(),
      evolutionBuild:window.realitySandboxEvolutionBuild || 'unknown',
      situationalInfluence:influence.getStats(),
      influenceGraph:influence.getInfluenceGraph(),
      populationInfluence:influence.getPopulationInfluence(),
    };
  }

  function invariants() {
    const base = previous.invariants();
    const failures = [...(base?.failures || [])];
    const state = snapshot();
    const inf = state.situationalInfluence || {};
    const joint = jointAction.getStats?.() || {};

    if (state.evolutionBuild !== 'evolution-v65-situational-influence') failures.push(`Unexpected evolution build ${state.evolutionBuild || 'unknown'}.`);
    if (inf.version !== 'v65a-derived-situational-influence') failures.push(`Unexpected v65 influence version ${inf.version || 'unknown'}.`);
    if (!inf.influenceFromOwnV57OutcomesOnly || !inf.responseReadinessFromOwnV64History) failures.push('The v65 own-history evidence contract is incomplete.');
    if (!inf.noSpeakerPrivateRoleInspection || !inf.noGlobalLeaderState || !inf.noLeaderRankOrOffice || !inf.noStoredInfluenceMembership) failures.push('The v65 privacy/no-authority-state contract is incomplete.');
    if (!inf.influenceGraphDerivedOnDemand || !inf.multipleObserversCanConvergeIndependently || !inf.influenceCanMoveWhenOutcomesChange) failures.push('The v65 derived/reversible influence contract is incomplete.');
    if (!inf.influenceModifiesBoundedV63Commitment || !inf.negativeOutcomesCanReduceCommitment) failures.push('The v65 bounded physical consequence contract is incomplete.');
    if (Math.abs((inf.influenceThreshold || 0) - 0.12) > 1e-12) failures.push('The v65 influence threshold changed unexpectedly.');
    if (!inf.authoritativeFixedStep || !inf.noHardPopulationCap || !inf.noHardDisplayCap || inf.surfaceRendererEnabled) failures.push('The v65 fixed-step/cap/renderer contract failed.');

    if (!joint.multipleCommitmentModifiersSupported || !joint.commitmentModifierInstalled || (joint.commitmentModifierCount || 0) < 2) failures.push('The v63 bounded modifier chain does not contain both v64 and v65 modifiers.');
    if (joint.maxCommitmentSteps !== 6 || Math.abs((joint.affiliationThreshold || 0) - 0.30) > 1e-12 || Math.abs((joint.evidenceThreshold || 0) - 0.18) > 1e-12) failures.push('The v63 commitment bounds changed under v65.');

    for (const [id, organism] of motile.entries()) {
      const raw = organism.bioV65;
      if (!raw) continue;
      for (const forbidden of ['leader','leaderId','rank','office','authority','authorityId','membership','members','groupId','coalitionId','influenceEdges','influenceGraph']) {
        if (forbidden in raw) failures.push(`Organism ${id} stores forbidden v65 authority/membership field ${forbidden}.`);
      }
      if (!Number.isFinite(raw.influenceSensitivity) || raw.influenceSensitivity < 0 || raw.influenceSensitivity > 1) failures.push(`Organism ${id} has invalid v65 influence sensitivity.`);
      if (!Number.isFinite(raw.outcomeSelectivity) || raw.outcomeSelectivity < 0 || raw.outcomeSelectivity > 1) failures.push(`Organism ${id} has invalid v65 outcome selectivity.`);
      const adjustment = raw.lastInfluenceAdjustment;
      if (adjustment) {
        if (!Number.isFinite(adjustment.influenceScore) || adjustment.influenceScore < -1 || adjustment.influenceScore > 1) failures.push(`Organism ${id} has invalid v65 influence score.`);
        if (![ -1, 1 ].includes(adjustment.durationAdjustment)) failures.push(`Organism ${id} has invalid v65 duration adjustment.`);
        if (!Number.isFinite(adjustment.strengthAdjustment) || Math.abs(adjustment.strengthAdjustment) > 0.0800000001) failures.push(`Organism ${id} has invalid v65 strength adjustment.`);
        if (!Number.isFinite(adjustment.responseReadiness) || adjustment.responseReadiness < 0 || adjustment.responseReadiness > 1) failures.push(`Organism ${id} has invalid v65 response readiness.`);
      }
    }

    const graph = state.influenceGraph || {};
    for (const edge of graph.edges || []) {
      if (!Number.isFinite(edge.observerId) || !Number.isFinite(edge.speakerId) || edge.observerId === edge.speakerId) failures.push('The v65 derived influence graph contains an invalid edge.');
      if (!Number.isFinite(edge.strength) || edge.strength < 0.12 || edge.strength > 1) failures.push('The v65 derived influence graph contains an out-of-bounds edge strength.');
    }

    return { ok:failures.length === 0, failures, snapshot:state };
  }

  const api = { installed:true, snapshot, invariants };
  window.realitySandboxEvolutionDiagnosticsV65 = api;
  window.realitySandboxEvolutionDiagnosticsV48d = api;
  document.documentElement.dataset.evolutionDiagnosticsV65 = 'ready-situational-influence';

  if (window.realitySandboxDebug && typeof window.realitySandboxDebug === 'object') {
    window.realitySandboxDebug.evolution = snapshot;
    window.realitySandboxDebug.evolutionInvariants = invariants;
  }

  const previousPresentationDiagnostics = window.realitySandboxPresentationDiagnostics;
  window.realitySandboxPresentationDiagnostics = () => ({
    ...(typeof previousPresentationDiagnostics === 'function' ? previousPresentationDiagnostics() : {}),
    evolutionV65:snapshot(),
  });
}

waitForRuntime().then(install);
