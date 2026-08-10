async function waitForRuntime() {
  while (true) {
    const previous = window.realitySandboxEvolutionDiagnosticsV63;
    const roles = window.realitySandboxRoleDifferentiationV64;
    const jointAction = window.realitySandboxCoalitionJointActionV63;
    const planet = window.realitySandboxPlanet;
    const motile = planet?.world?.ecs?.components?.motile;
    if (previous?.installed && roles?.installed && jointAction?.installed && motile instanceof Map) {
      return { previous, roles, jointAction, motile };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ previous, roles, jointAction, motile }) {
  if (window.realitySandboxEvolutionDiagnosticsV64?.installed) return;

  function snapshot() {
    return {
      ...previous.snapshot(),
      evolutionBuild:window.realitySandboxEvolutionBuild || 'unknown',
      roleDifferentiation:roles.getStats(),
      populationRoles:roles.getPopulationRoles(),
    };
  }

  function invariants() {
    const base = previous.invariants();
    const failures = [...(base?.failures || [])];
    const state = snapshot();
    const role = state.roleDifferentiation || {};
    const joint = jointAction.getStats?.() || {};

    if (role.version !== 'v64a-history-dependent-initiative-response') failures.push(`Unexpected v64 role version ${role.version || 'unknown'}.`);
    if (!role.rolesLearnedFromOwnHistoryOnly || !role.initiationsFromOwnV56Acts || !role.responsesFromOwnV63Applications) failures.push('The v64 own-history evidence contract is incomplete.');
    if (!role.noPartnerPrivateRoleInspection || !role.complementarityUsesOwnV57PartnerModel) failures.push('The v64 partner privacy/complementarity contract is incomplete.');
    if (!role.complementaryHistoryBiasesAudienceSelection || !role.responseHistoryModifiesFutureV63Commitment) failures.push('The v64 behavioral differentiation contract is incomplete.');
    if (!role.noExplicitRoleLabels || !role.noLeaderOrRankState || !role.noStoredGroupRoleAssignment) failures.push('The v64 no-assigned-role/hierarchy contract is incomplete.');
    if (!role.historyCanBreakGeneticSymmetry || !role.scalarRoleMemory || role.minimumRoleEvidence !== 2 || Math.abs((role.roleBiasThreshold || 0) - 0.22) > 1e-12) failures.push('The v64 scalar differentiation schema is invalid.');
    if (!role.authoritativeFixedStep || !role.noHardPopulationCap || !role.noHardDisplayCap || role.surfaceRendererEnabled) failures.push('The v64 fixed-step/cap/renderer contract failed.');

    if (!joint.commitmentModifierSupported || !joint.commitmentModifierInstalled) failures.push('The generic bounded v63 commitment modifier seam is not active under v64.');
    if (joint.maxCommitmentSteps !== 6 || Math.abs((joint.affiliationThreshold || 0) - 0.30) > 1e-12 || Math.abs((joint.evidenceThreshold || 0) - 0.18) > 1e-12) failures.push('The v63 physical commitment bounds changed under v64.');

    for (const [id, organism] of motile.entries()) {
      const raw = organism.bioV64;
      if (!raw) continue;
      for (const forbidden of ['role','roleLabel','roleId','leader','leaderId','rank','assignment','job','groupRole','coalitionRole']) {
        if (forbidden in raw) failures.push(`Organism ${id} stores forbidden explicit v64 role/hierarchy field ${forbidden}.`);
      }
      if (!Number.isFinite(raw.initiativeTendency) || raw.initiativeTendency < -1 || raw.initiativeTendency > 1) failures.push(`Organism ${id} has invalid v64 initiative tendency.`);
      if (!Number.isInteger(raw.roleEvidence) || raw.roleEvidence < 0 || !Number.isInteger(raw.initiations) || raw.initiations < 0 || !Number.isInteger(raw.responses) || raw.responses < 0) failures.push(`Organism ${id} has invalid v64 evidence counters.`);
      if (raw.roleEvidence !== raw.initiations + raw.responses) failures.push(`Organism ${id} has inconsistent v64 evidence accounting.`);
      const adjustment = raw.lastCommitmentAdjustment;
      if (adjustment) {
        if (!Number.isFinite(adjustment.durationAdjustment) || adjustment.durationAdjustment < 0 || adjustment.durationAdjustment > 2) failures.push(`Organism ${id} has invalid v64 duration adjustment.`);
        if (!Number.isFinite(adjustment.strengthAdjustment) || adjustment.strengthAdjustment < 0 || adjustment.strengthAdjustment > 0.10) failures.push(`Organism ${id} has invalid v64 strength adjustment.`);
      }
    }

    return { ok:failures.length === 0, failures, snapshot:state };
  }

  const api = { installed:true, snapshot, invariants };
  window.realitySandboxEvolutionDiagnosticsV64 = api;
  window.realitySandboxEvolutionDiagnosticsV48d = api;
  document.documentElement.dataset.evolutionDiagnosticsV64 = 'ready-role-differentiation';

  if (window.realitySandboxDebug && typeof window.realitySandboxDebug === 'object') {
    window.realitySandboxDebug.evolution = snapshot;
    window.realitySandboxDebug.evolutionInvariants = invariants;
  }

  const previousPresentationDiagnostics = window.realitySandboxPresentationDiagnostics;
  window.realitySandboxPresentationDiagnostics = () => ({
    ...(typeof previousPresentationDiagnostics === 'function' ? previousPresentationDiagnostics() : {}),
    evolutionV64:snapshot(),
  });
}

waitForRuntime().then(install);
