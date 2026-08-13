import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSuccessRecord, isSuccessfulAbiogenesis } from '../src/archive/success-record.js';

const successful = {
  seed: 's', numericSeed: 7, steps: 42, clock: 123.5,
  classification: 'sustained-darwinian-system', lifeDetected: true,
  termination: 'life-detected', configuration: { cutoff: 5000, dt: 0.25 },
  evidence: { heredity: 0.8, replication: 0.5, variation: 0.3, selection: 0.25 },
  metrics: { maxElementDrift: 1e-15 }, evolution: { generations: 30 },
  terminalDetection: { classification: 'sustained-darwinian-system' },
};

test('success archive accepts detector-qualified abiogenesis', () => {
  assert.equal(isSuccessfulAbiogenesis(successful), true);
  const record = buildSuccessRecord(successful, { gitCommit: 'abc123', modelVersion: '0.3.0', recordedAt: '2026-08-13T00:00:00Z' });
  assert.equal(record.producingCommit, 'abc123');
  assert.equal(record.seed, 's');
  assert.equal(record.configuration.cutoff, 5000);
});

test('success archive refuses transient replicators and false positives', () => {
  for (const result of [
    { ...successful, classification: 'transient-replicator', lifeDetected: false, termination: 'cutoff-reached' },
    { ...successful, lifeDetected: false },
    { ...successful, termination: 'cutoff-reached' },
  ]) {
    assert.equal(isSuccessfulAbiogenesis(result), false);
    assert.throws(() => buildSuccessRecord(result), /Refusing to archive/);
  }
});
