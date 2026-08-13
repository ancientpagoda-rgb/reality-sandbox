import test from 'node:test';
import assert from 'node:assert/strict';
import { createExperimentRunner } from '../src/experiment/experiment-runner.js';
import { createLifeDetector } from '../src/experiment/life-detector.js';

test('runner archives and reseeds after cutoff',()=>{const runner=createExperimentRunner({baseSeed:'test',maxRuns:3,run:{columns:8,rows:4,cutoff:5,dt:.5}});const summary=runner.runAll();assert.equal(summary.completed,3);assert.equal(runner.getArchive().length,3);assert.ok(runner.getArchive().every(r=>r.termination==='cutoff-reached'||r.termination==='life-detected'))});

test('detector refuses to call chemistry alone Darwinian',()=>{const d=createLifeDetector({candidatePersistenceSteps:2});for(let i=0;i<5;i++)d.evaluate({chemistry:{compartmentPotential:.8,selfMaintenance:.8,complexity:.8}});const result=d.evaluate({chemistry:{compartmentPotential:.8,selfMaintenance:.8,complexity:.8}});assert.equal(result.classification,'transient-proto-life');assert.equal(result.lifeDetected,false)});

test('reading snapshots does not advance life-detector persistence',()=>{
  const runner=createExperimentRunner({baseSeed:'snapshot-purity',maxRuns:1,run:{columns:8,rows:4,cutoff:20,dt:.5,detector:{candidateCompartment:0,candidateMaintenance:0,candidateComplexity:0,candidatePersistenceSteps:5}}});
  runner.tick(1);
  const before=runner.status().current.detection.streaks.candidate;
  for(let i=0;i<20;i++) runner.status();
  const after=runner.status().current.detection.streaks.candidate;
  assert.equal(after,before);
});

test('run archives its most advanced transient state even after collapse', async () => {
  const { createExperimentRun } = await import('../src/experiment/run-single.js');
  const run = createExperimentRun({
    seed: 'best-state', columns: 4, rows: 2, cutoff: 4, dt: 0.5,
    detector: { replicatorPersistenceSteps: 2 },
    evolutionProvider: ({ steps }) => steps <= 3 ? {
      heredity: 0.9, replication: 0.8, variation: 0.3, selection: 0.2,
      generations: 5, polymerPopulation: 8, sequenceVariants: 2, totalTemplatedBirths: 12,
    } : {},
  });
  const final = run.runToCompletion();
  assert.equal(final.classification, 'transient-replicator');
  assert.equal(final.lifeDetected, false);
  assert.equal(final.termination, 'cutoff-reached');
});
