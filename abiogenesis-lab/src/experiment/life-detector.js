const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

export function createLifeDetector(options = {}) {
  const config = {
    candidateCompartment: options.candidateCompartment ?? 0.12,
    candidateMaintenance: options.candidateMaintenance ?? 0.025,
    candidateComplexity: options.candidateComplexity ?? 0.12,
    candidatePersistenceSteps: options.candidatePersistenceSteps ?? 20,
    replicatorPersistenceSteps: options.replicatorPersistenceSteps ?? 8,
    darwinianPersistenceSteps: options.darwinianPersistenceSteps ?? 50,
    cellularPersistenceSteps: options.cellularPersistenceSteps ?? 80,
    minDarwinianPolymers: options.minDarwinianPolymers ?? 12,
    minDarwinianVariants: options.minDarwinianVariants ?? 2,
    minCellularCompartments: options.minCellularCompartments ?? 2,
    minCellularGenerations: options.minCellularGenerations ?? 3,
  };
  let candidateStreak = 0, replicatorStreak = 0, darwinianStreak = 0, cellularStreak = 0;
  let peakCandidateScore = 0;

  function evaluate({ chemistry, evolution = {} }) {
    // Abiogenesis is a local event: use the strongest resolved chemical niche
    // when available instead of washing it out in a planet-wide mean.
    const compartment = clamp(chemistry.maxCompartmentPotential ?? chemistry.compartmentPotential ?? 0);
    const maintenance = clamp(chemistry.maxSelfMaintenance ?? chemistry.selfMaintenance ?? 0);
    const complexity = clamp(chemistry.maxComplexity ?? chemistry.complexity ?? 0);
    const candidateScore = clamp((compartment / Math.max(1e-9, config.candidateCompartment)
      + maintenance / Math.max(1e-9, config.candidateMaintenance)
      + complexity / Math.max(1e-9, config.candidateComplexity)) / 3);
    peakCandidateScore = Math.max(peakCandidateScore, candidateScore);
    const candidate = compartment >= config.candidateCompartment
      && maintenance >= config.candidateMaintenance
      && complexity >= config.candidateComplexity;
    candidateStreak = candidate ? candidateStreak + 1 : Math.max(0, candidateStreak - 2);

    const heredity = clamp(evolution.heredity ?? 0);
    const replication = clamp(evolution.replication ?? 0);
    const variation = clamp(evolution.variation ?? 0);
    const selection = clamp(evolution.selection ?? 0);
    const generations = Math.max(0, Number(evolution.generations ?? 0));
    const polymerPopulation = Math.max(0, Number(evolution.polymerPopulation ?? 0));
    const sequenceVariants = Math.max(0, Number(evolution.sequenceVariants ?? 0));
    const compartments = Math.max(0, Number(evolution.compartments ?? 0));
    const cellGenerations = Math.max(0, Number(evolution.cellGenerations ?? 0));
    const totalTemplatedBirths = Math.max(0, Number(evolution.totalTemplatedBirths ?? 0));

    // A transient replicator is deliberately not called life. It means actual
    // templated copying occurred with measurable fidelity for a sustained window.
    const replicator = polymerPopulation >= 2 && generations >= 2 && totalTemplatedBirths >= 3
      && heredity > 0.18 && replication > 0.015;
    replicatorStreak = replicator ? replicatorStreak + 1 : Math.max(0, replicatorStreak - 1);

    const darwinian = heredity > 0.6 && replication > 0.15 && variation > 0.2 && selection > 0.15
      && generations >= 20 && polymerPopulation >= config.minDarwinianPolymers && sequenceVariants >= config.minDarwinianVariants;
    darwinianStreak = darwinian ? darwinianStreak + 1 : 0;

    const cellular = darwinian && compartment > 0.35 && clamp(evolution.cellDivision ?? 0) > 0.5
      && clamp(evolution.metabolism ?? maintenance) > 0.4 && compartments >= config.minCellularCompartments
      && cellGenerations >= config.minCellularGenerations;
    cellularStreak = cellular ? cellularStreak + 1 : 0;

    let classification = 'no-life';
    if (candidateStreak >= config.candidatePersistenceSteps) classification = 'transient-proto-life';
    if (replicatorStreak >= config.replicatorPersistenceSteps) classification = 'transient-replicator';
    if (darwinianStreak >= config.darwinianPersistenceSteps) classification = 'sustained-darwinian-system';
    if (cellularStreak >= config.cellularPersistenceSteps) classification = 'cellular-life';

    return {
      classification,
      lifeDetected: classification === 'sustained-darwinian-system' || classification === 'cellular-life',
      candidateDetected: classification !== 'no-life',
      candidateScore,
      peakCandidateScore,
      evidence: {
        compartment, maintenance, complexity, heredity, replication, variation, selection, generations,
        polymerPopulation, sequenceVariants, compartments, cellGenerations, totalTemplatedBirths,
      },
      streaks: { candidate: candidateStreak, replicator: replicatorStreak, darwinian: darwinianStreak, cellular: cellularStreak },
    };
  }

  return {
    evaluate,
    getState: () => ({ candidateStreak, replicatorStreak, darwinianStreak, cellularStreak, peakCandidateScore }),
  };
}
