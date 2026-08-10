async function waitForRuntime() {
  while (true) {
    const previous = window.realitySandboxEvolutionDiagnosticsV65;
    const consensus = window.realitySandboxDistributedConsensusV66;
    const planet = window.realitySandboxPlanet;
    const motile = planet?.world?.ecs?.components?.motile;
    if (previous?.installed && consensus?.installed && motile instanceof Map) {
      return { previous, consensus, motile };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ previous, consensus, motile }) {
  if (window.realitySandboxEvolutionDiagnosticsV66?.installed) return;

  function snapshot() {
    return {
      ...previous.snapshot(),
      evolutionBuild:window.realitySandboxEvolutionBuild || 'unknown',
      distributedConsensus:consensus.getStats(),
      decisionField:consensus.getDecisionField(),
      populationDecisions:consensus.getPopulationDecisions(),
    };
  }

  function invariants() {
    const base = previous.invariants();
    const failures = [...(base?.failures || [])];
    const state = snapshot();
    const con = state.distributedConsensus || {};

    if (con.version !== 'v66a-distributed-local-consensus') failures.push(`Unexpected v66 consensus version ${con.version || 'unknown'}.`);
    if (!con.usesPublicV56TokensAndGesturesOnly || !con.listenerDecodesOwnV55Semantics || !con.speakerPairUtilityAndWillingnessIgnored) failures.push('The v66 public-signal/listener-decoding privacy contract is incomplete.');
    if (!con.privateWeightFromOwnV65InfluenceOnly || !con.physicallyLocalProposalCompetition || !con.compatibleSignalsAggregateLocally || !con.decisionRequiresSupportAndMargin) failures.push('The v66 local proposal-selection contract is incomplete.');
    if (!con.decisionsStoredPerOrganismOnly || !con.aggregateConsensusDerivedOnDemand) failures.push('The v66 distributed-state contract is incomplete.');
    if (!con.noGlobalVoteLedger || !con.noGovernmentAuthorityOrLeaderObject || !con.noStoredGroupDecision) failures.push('The v66 no-governance/no-global-decision contract is incomplete.');
    if (!con.consensusCanSplitAndReform || !con.physicalSteeringContribution || !con.detectedDangerOverridesConsensus) failures.push('The v66 reversible physical coordination contract is incomplete.');
    if (Math.abs((con.decisionThreshold || 0) - 0.12) > 1e-12 || Math.abs((con.marginThreshold || 0) - 0.08) > 1e-12 || con.directionSectors !== 8) failures.push('The v66 decision schema changed unexpectedly.');
    if (!con.spatialHashing || !con.authoritativeFixedStep || !con.noHardPopulationCap || !con.noHardDisplayCap || con.surfaceRendererEnabled) failures.push('The v66 fixed-step/performance/cap contract failed.');

    const forbidden = ['leader','leaderId','government','authority','authorityId','voteLedger','votes','groupDecision','collectiveDecision','consensusId','members','membership','proposalVotes','globalDecision','groupProposal'];
    for (const [id, organism] of motile.entries()) {
      const raw = organism.bioV66;
      if (!raw) continue;
      for (const field of forbidden) {
        if (field in raw) failures.push(`Organism ${id} stores forbidden v66 governance/group-decision field ${field}.`);
      }
      if (!Number.isFinite(raw.consensusSensitivity) || raw.consensusSensitivity < 0 || raw.consensusSensitivity > 1) failures.push(`Organism ${id} has invalid v66 consensus sensitivity.`);
      if (!Number.isFinite(raw.ambiguityTolerance) || raw.ambiguityTolerance < 0 || raw.ambiguityTolerance > 1) failures.push(`Organism ${id} has invalid v66 ambiguity tolerance.`);

      const decision = raw.lastLocalDecision;
      if (decision) {
        if (typeof decision.proposalKey !== 'string' || !decision.proposalKey) failures.push(`Organism ${id} has invalid v66 proposal key.`);
        if (!Number.isFinite(decision.support) || decision.support < 0.12) failures.push(`Organism ${id} stores a v66 decision below support threshold.`);
        if (!Number.isFinite(decision.margin) || !Number.isFinite(decision.requiredMargin) || decision.margin < decision.requiredMargin) failures.push(`Organism ${id} stores a v66 decision below its margin threshold.`);
        if (!Number.isInteger(decision.sector) || decision.sector < 0 || decision.sector >= 8) failures.push(`Organism ${id} has invalid v66 direction sector.`);
        const dx = Number(decision.direction?.x);
        const dy = Number(decision.direction?.y);
        const length = Math.hypot(dx, dy);
        if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(length - 1) > 1e-6) failures.push(`Organism ${id} has non-unit v66 decision direction.`);
        if (!Array.isArray(decision.speakerIds) || !decision.speakerIds.length || decision.speakerIds.some(speakerId => !Number.isFinite(speakerId) || speakerId === id)) failures.push(`Organism ${id} has invalid v66 public-signal speaker list.`);
      }

      const applied = raw.lastAppliedDecision;
      if (applied?.applied) {
        if (!Number.isFinite(applied.strength) || applied.strength < 0.10 || applied.strength > 0.28) failures.push(`Organism ${id} has invalid v66 steering strength.`);
        if (!Number.isFinite(applied.directionalVelocityBefore) || !Number.isFinite(applied.directionalVelocityAfter) || !Number.isFinite(applied.directionalVelocityDelta)) failures.push(`Organism ${id} has invalid v66 physical steering record.`);
      }
      if (applied?.interrupted && applied.reason !== 'detected-danger') failures.push(`Organism ${id} has invalid v66 interruption reason.`);
    }

    for (const lineage of state.decisionField?.lineages || []) {
      for (const proposal of lineage.proposals || []) {
        if (typeof proposal.proposalKey !== 'string' || !Number.isInteger(proposal.observers) || proposal.observers < 1) failures.push('The derived v66 decision field contains an invalid proposal aggregate.');
      }
    }

    return { ok:failures.length === 0, failures, snapshot:state };
  }

  const api = { installed:true, snapshot, invariants };
  window.realitySandboxEvolutionDiagnosticsV66 = api;
  window.realitySandboxEvolutionDiagnosticsV48d = api;
  document.documentElement.dataset.evolutionDiagnosticsV66 = 'ready-distributed-local-consensus';

  if (window.realitySandboxDebug && typeof window.realitySandboxDebug === 'object') {
    window.realitySandboxDebug.evolution = snapshot;
    window.realitySandboxDebug.evolutionInvariants = invariants;
  }

  const previousPresentationDiagnostics = window.realitySandboxPresentationDiagnostics;
  window.realitySandboxPresentationDiagnostics = () => ({
    ...(typeof previousPresentationDiagnostics === 'function' ? previousPresentationDiagnostics() : {}),
    evolutionV66:snapshot(),
  });
}

waitForRuntime().then(install);
