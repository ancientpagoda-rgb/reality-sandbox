import { createExperimentRun } from './run-single.js';
import { hashSeed } from '../core/rng.js';

export function createExperimentRunner(options = {}) {
  const baseSeed = String(options.baseSeed ?? 'abiogenesis-lab');
  const maxRuns = Math.max(1, Math.floor(options.maxRuns ?? 100));
  const archive = [];
  let runIndex = 0;
  let current = null;

  function makeSeed(index) {
    return `${baseSeed}:${index}:${hashSeed(`${baseSeed}:${index}`)}`;
  }

  function startNext() {
    if (runIndex >= maxRuns) { current = null; return null; }
    current = createExperimentRun({ ...options.run, seed: makeSeed(runIndex) });
    runIndex++;
    return current;
  }

  function tick(stepCount = 1) {
    if (!current) startNext();
    if (!current) return status();
    current.step(stepCount);
    if (current.snapshot().finished) {
      archive.push(current.getFinal());
      if (archive.length < maxRuns) startNext(); else current = null;
    }
    return status();
  }

  function runAll() {
    while (archive.length < maxRuns) {
      if (!current) startNext();
      archive.push(current.runToCompletion());
      current = null;
    }
    return summary();
  }

  function summary() {
    const counts = { 'no-life': 0, 'transient-proto-life': 0, 'transient-replicator': 0, 'sustained-darwinian-system': 0, 'cellular-life': 0 };
    for (const result of archive) counts[result.classification] = (counts[result.classification] ?? 0) + 1;
    const n = Math.max(1, archive.length);
    const mean = key => archive.reduce((sum, result) => sum + (result.metrics?.[key] ?? 0), 0) / n;
    const evolutionMean = key => archive.reduce((sum, result) => sum + (result.evolution?.[key] ?? 0), 0) / n;
    const maxima = key => archive.reduce((max, result) => Math.max(max, result.evolution?.[key] ?? 0), 0);
    return {
      completed: archive.length,
      requested: maxRuns,
      counts,
      rates: Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, value / n])),
      means: { organics: mean('organics'), amphiphiles: mean('amphiphiles'), precursors: mean('precursors'), complexity: mean('complexity'), maxElementDrift: mean('maxElementDrift') },
      evolutionMeans: { compartments: evolutionMean('compartments'), polymerPopulation: evolutionMean('polymerPopulation'), sequenceVariants: evolutionMean('sequenceVariants'), heredity: evolutionMean('heredity'), replication: evolutionMean('replication'), variation: evolutionMean('variation'), selection: evolutionMean('selection') },
      eventMeans: { deNovoPolymerizations: evolutionMean('totalDeNovoPolymerizations'), templatedBirths: evolutionMean('totalTemplatedBirths'), mutations: evolutionMean('totalMutations'), divisions: evolutionMean('totalDivisions') },
      evolutionPeaks: { polymerPopulation: maxima('peakPolymerPopulation'), freePolymerPopulation: maxima('peakFreePolymerPopulation'), sequenceVariants: maxima('peakSequenceVariants'), generations: maxima('peakGenerations'), cellGenerations: maxima('peakCellGenerations'), compartments: maxima('peakCompartments') }
    };
  }

  function status() { return { runIndex, maxRuns, completed: archive.length, current: current?.snapshot() ?? null, summary: summary(), archive: [...archive] }; }

  return { tick, runAll, status, summary, getArchive: () => [...archive] };
}
