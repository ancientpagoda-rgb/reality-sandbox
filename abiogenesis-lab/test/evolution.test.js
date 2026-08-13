import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlanetEnvironment } from '../src/core/environment.js';
import { createPhysicalChemicalKernel } from '../src/core/physical-chemical-kernel.js';
import { createPrebioticEvolution } from '../src/evolution/prebiotic-evolution.js';
import { createLifeDetector } from '../src/experiment/life-detector.js';

function preparedChemistry() {
  const generated = createPlanetEnvironment({ columns: 8, rows: 4, seed: 777, planet: { waterFraction: 0.5, atmosphereRetention: 0.7 } });
  const kernel = createPhysicalChemicalKernel({
    columns: 8, rows: 4, seed: 123,
    star: { metallicity: 0 }, disk: { carbonToOxygen: 0.7 },
    planet: { composition: 'silicate-rocky', waterFraction: 0.5, atmosphereRetention: 0.7, equilibriumTemperature: 300 },
    environment: generated.environment,
  });
  for (let i = 0; i < 1200; i++) kernel.step(0.5);
  return { generated, kernel };
}

test('chemical material transferred into polymers remains in conservation ledger', () => {
  const { kernel } = preparedChemistry();
  const species = kernel.getSpecies();
  const cell = [...species.reducedCarbon].reduce((best, value, index) => value > species.reducedCarbon[best] ? index : best, 0);
  const before = kernel.getMetrics().maxElementDrift;
  const transfer = kernel.withdraw(cell, { reducedCarbon: 0.00002, ammonia: 0.00001, phosphate: 0.0000005 });
  assert.ok(transfer.scale > 0.9);
  assert.ok(kernel.getExternalElementLedger().C > 0);
  assert.ok(kernel.getMetrics().maxElementDrift < 1e-8);
  kernel.deposit(cell, transfer.bundle);
  assert.ok(kernel.getMetrics().maxElementDrift < 1e-8);
  assert.ok(before < 1e-8);
});

test('templated polymers copy, mutate, and preserve represented matter', () => {
  const { generated, kernel } = preparedChemistry();
  const species = kernel.getSpecies();
  const cell = [...species.reducedCarbon].reduce((best, value, index) => value > species.reducedCarbon[best] ? index : best, 0);
  const evolution = createPrebioticEvolution({
    kernel, environment: generated.environment, seed: 99,
    options: { mutationRate: 0.22, templateRate: 2.2, divisionThreshold: 1.5 },
  });
  const id = evolution.debugSeedCompartment({ cell, sequence: 'ABCDABCD', copies: 3, energy: 2, membrane: 1.15 });
  assert.ok(id);
  for (let i = 0; i < 220; i++) { kernel.step(0.25); evolution.step(0.25); }
  const metrics = evolution.getMetrics();
  assert.ok(metrics.polymerPopulation > 3, `population=${metrics.polymerPopulation}`);
  assert.ok(metrics.sequenceVariants > 1, `variants=${metrics.sequenceVariants}`);
  assert.ok(metrics.generations > 0, `generations=${metrics.generations}`);
  assert.ok(metrics.variation > 0, `variation=${metrics.variation}`);
  assert.ok(kernel.getMetrics().maxElementDrift < 1e-8, `drift=${kernel.getMetrics().maxElementDrift}`);
});

test('life detector can only cross Darwinian threshold with explicit evolutionary evidence', () => {
  const detector = createLifeDetector({ candidatePersistenceSteps: 1, darwinianPersistenceSteps: 3 });
  let result;
  for (let i = 0; i < 4; i++) {
    result = detector.evaluate({
      chemistry: { maxCompartmentPotential: 0.8, maxSelfMaintenance: 0.8, maxComplexity: 0.8 },
      evolution: { heredity: 0.9, replication: 0.9, variation: 0.5, selection: 0.8, generations: 30, polymerPopulation: 50, sequenceVariants: 8 },
    });
  }
  assert.equal(result.classification, 'sustained-darwinian-system');
  assert.equal(result.lifeDetected, true);
});

test('surface polymers can copy before compartments exist', () => {
  const { generated, kernel } = preparedChemistry();
  const species = kernel.getSpecies();
  const cell = [...species.reducedCarbon].reduce((best, value, index) => value > species.reducedCarbon[best] ? index : best, 0);
  const evolution = createPrebioticEvolution({
    kernel, environment: generated.environment, seed: 441,
    options: { mutationRate: 0.12, freeTemplateRate: 2.5, compartmentNucleationRate: 0 },
  });
  assert.equal(evolution.debugSeedFreePolymer({ cell, sequence: 'ABCDABCD', copies: 3 }), true);
  for (let i = 0; i < 180; i++) { kernel.step(0.25); evolution.step(0.25); }
  const metrics = evolution.getMetrics();
  assert.equal(metrics.peakCompartments, 0);
  assert.ok(metrics.peakFreePolymerPopulation > 3, `peakFree=${metrics.peakFreePolymerPopulation}`);
  assert.ok(metrics.peakGenerations > 0, `generations=${metrics.peakGenerations}`);
  assert.ok(kernel.getMetrics().maxElementDrift < 1e-8);
});
