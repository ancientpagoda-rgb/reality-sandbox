import { createPlanetEnvironment } from '../core/environment.js';
import { createPhysicalChemicalKernel } from '../core/physical-chemical-kernel.js';
import { createLifeDetector } from './life-detector.js';
import { createPrebioticEvolution } from '../evolution/prebiotic-evolution.js';
import { hashSeed } from '../core/rng.js';

export function createExperimentRun(options = {}) {
  const seed = options.seed ?? 'abiogenesis-1';
  const numericSeed = hashSeed(seed);
  const columns = options.columns ?? 24, rows = options.rows ?? 12;
  const star = { metallicity: -0.03, ...(options.star ?? {}) };
  const disk = { carbonToOxygen: 0.54, ...(options.disk ?? {}) };
  const planet = {
    composition: 'silicate-rocky', atmosphereRetention: 0.63, waterFraction: 0.34,
    equilibriumTemperature: 286, massEarth: 0.96, ...(options.planet ?? {})
  };
  const generated = options.externalEnvironment
    ? { columns, rows, size: columns * rows, environment: options.externalEnvironment }
    : createPlanetEnvironment({ columns, rows, seed: numericSeed, planet });
  const kernel = createPhysicalChemicalKernel({ columns, rows, seed: numericSeed ^ 0x51F15EED, star, disk, planet, environment: generated.environment });
  const detectorOptions = structuredClone(options.detector ?? {});
  const evolutionOptions = structuredClone(options.evolution ?? {});
  const detector = createLifeDetector(detectorOptions);
  const evolution = options.enableEvolution === false ? null : createPrebioticEvolution({
    kernel, environment: generated.environment, seed: numericSeed ^ 0xE701A17, options: evolutionOptions
  });
  const configuration = {
    columns, rows, cutoff: Math.max(1, Number(options.cutoff ?? 5000)), dt: Math.max(0.001, Number(options.dt ?? 0.25)),
    star: structuredClone(star), disk: structuredClone(disk), planet: structuredClone(planet),
    detector: detectorOptions, evolution: evolutionOptions, enableEvolution: options.enableEvolution !== false,
    environmentSource: options.externalEnvironment ? 'external' : 'procedural',
  };
  const history = [];
  const maxHistory = options.maxHistory ?? 400;
  const cutoff = configuration.cutoff;
  const dt = configuration.dt;
  let steps = 0, finished = false, final = null;
  let lastDetection = {
    classification: 'no-life', lifeDetected: false, candidateDetected: false,
    candidateScore: 0, peakCandidateScore: 0,
    evidence: { compartment: 0, maintenance: 0, complexity: 0, heredity: 0, replication: 0, variation: 0, selection: 0, generations: 0 },
    streaks: { candidate: 0, replicator: 0, darwinian: 0, cellular: 0 }
  };
  let bestDetection = structuredClone(lastDetection);
  const classificationRank = { 'no-life': 0, 'transient-proto-life': 1, 'transient-replicator': 2, 'sustained-darwinian-system': 3, 'cellular-life': 4 };

  function step(count = 1) {
    if (finished) return snapshot();
    for (let n = 0; n < count && !finished; n++) {
      kernel.step(dt);
      steps++;
      const metrics = kernel.getMetrics();
      const evolved = evolution?.step(dt) ?? {};
      const externalEvolution = options.evolutionProvider?.({ kernel, metrics, steps, evolution }) ?? {};
      const evolutionMetrics = { ...evolved, ...externalEvolution };
      lastDetection = detector.evaluate({ chemistry: metrics, evolution: evolutionMetrics });
      if ((classificationRank[lastDetection.classification] ?? 0) > (classificationRank[bestDetection.classification] ?? 0)
        || ((classificationRank[lastDetection.classification] ?? 0) === (classificationRank[bestDetection.classification] ?? 0) && lastDetection.candidateScore > bestDetection.candidateScore)) {
        bestDetection = structuredClone(lastDetection);
      }
      if (steps % Math.max(1, Math.floor(options.captureEvery ?? 10)) === 0) {
        history.push({ step: steps, clock: metrics.clock, organics: metrics.organics, amphiphiles: metrics.amphiphiles, precursors: metrics.precursors, complexity: metrics.complexity, candidateScore: lastDetection.candidateScore, classification: lastDetection.classification, polymers: evolved.polymerPopulation ?? 0, variants: evolved.sequenceVariants ?? 0, heredity: evolved.heredity ?? 0, replication: evolved.replication ?? 0, variation: evolved.variation ?? 0, selection: evolved.selection ?? 0 });
        if (history.length > maxHistory) history.shift();
      }
      if (lastDetection.lifeDetected || metrics.clock >= cutoff) finish(lastDetection.lifeDetected ? lastDetection : bestDetection);
    }
    return snapshot();
  }

  function finish(detection = lastDetection) {
    if (finished && final) return final;
    finished = true;
    const metrics = kernel.getMetrics();
    final = {
      seed: String(seed), numericSeed, steps, clock: metrics.clock, configuration: structuredClone(configuration),
      classification: detection.classification,
      lifeDetected: detection.lifeDetected,
      candidateDetected: detection.candidateDetected,
      peakCandidateScore: detection.peakCandidateScore,
      metrics,
      evidence: detection.evidence,
      evolution: evolution?.getMetrics() ?? {},
      terminalDetection: structuredClone(lastDetection),
      termination: detection.lifeDetected ? 'life-detected' : 'cutoff-reached'
    };
    return final;
  }

  function snapshot() {
    return {
      seed: String(seed), numericSeed, steps, cutoff, dt, finished,
      metrics: kernel.getMetrics(),
      detection: structuredClone(lastDetection),
      bestDetection: structuredClone(bestDetection),
      evolution: evolution?.getMetrics() ?? {},
      history: [...history],
      final
    };
  }

  function runToCompletion(maxSteps = Math.ceil(cutoff / dt) + 1) {
    for (let i = 0; i < maxSteps && !finished; i++) step(1);
    if (!finished) finish();
    return final;
  }

  return { step, runToCompletion, snapshot, getKernel: () => kernel, getEvolution: () => evolution, getEnvironment: () => generated.environment, getFinal: () => final };
}
