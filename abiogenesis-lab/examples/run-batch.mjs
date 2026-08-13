import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createExperimentRunner } from '../src/index.js';

const args = process.argv.slice(2);
const value = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const runs = Math.max(1, Number(value('--runs', 25)));
const cutoff = Math.max(1, Number(value('--cutoff', 500)));
const baseSeed = value('--seed', 'abiogenesis-batch');
const columns = Math.max(4, Number(value('--columns', 12)));
const rows = Math.max(2, Number(value('--rows', 6)));
const dt = Math.max(0.05, Math.min(1, Number(value('--dt', 1))));
const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const gitCommit = process.env.GITHUB_SHA || (() => { try { return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return 'unknown'; } })();
const runner = createExperimentRunner({ baseSeed, maxRuns: runs, run: { cutoff, dt, columns, rows, captureEvery: 25 } });
const summary = runner.runAll();
const payload = { generatedAt: new Date().toISOString(), provenance: { modelVersion: packageJson.version, gitCommit }, baseSeed, runs, cutoff, columns, rows, dt, summary, archive: runner.getArchive() };
const out = path.resolve('results', `batch-${Date.now()}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(payload, null, 2));
console.log(JSON.stringify(summary, null, 2));
console.log(`\nSaved ${out}`);
