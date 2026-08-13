import { createExperimentRun } from './experiment/run-single.js';

// Thin integration boundary. Reality Sandbox owns astrophysics/planet/geology.
// Abiogenesis Lab owns chemistry experiments and life classification.
export function createRealitySandboxAbiogenesisExperiment({
  worldSeed, star, disk, planet, environment, columns = 24, rows = 12, cutoff = 5000,
  evolutionProvider
} = {}) {
  const run = createExperimentRun({
    seed: worldSeed,
    star,
    disk,
    planet,
    columns,
    rows,
    cutoff,
    externalEnvironment: environment,
    evolutionProvider
  });
  return {
    step: count => run.step(count),
    snapshot: () => run.snapshot(),
    final: () => run.getFinal(),
    chemistry: () => run.getKernel()
  };
}
