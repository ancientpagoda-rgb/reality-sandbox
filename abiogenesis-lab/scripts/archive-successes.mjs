import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { buildSuccessRecord, isSuccessfulAbiogenesis, stableJson } from '../src/archive/success-record.js';

const root = process.cwd();
const resultsDir = path.join(root, 'results');
const successDir = path.join(resultsDir, 'successes');
const indexPath = path.join(resultsDir, 'index.json');
const args = process.argv.slice(2);

function flagValue(name, fallback = null) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

function gitCommit() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return 'unknown'; }
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const commit = gitCommit();
fs.mkdirSync(successDir, { recursive: true });

let files = [];
const explicit = flagValue('--file');
if (explicit) {
  files = [path.resolve(explicit)];
} else {
  files = fs.readdirSync(resultsDir)
    .filter(name => /^batch-.*\.json$/.test(name))
    .map(name => path.join(resultsDir, name))
    .sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);
  if (args.includes('--latest') && files.length) files = [files.at(-1)];
}

let index = { schemaVersion: 1, updatedAt: null, successes: [] };
if (fs.existsSync(indexPath)) index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const known = new Set(index.successes.map(item => item.id));
let added = 0;

for (const file of files) {
  const batch = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const result of batch.archive ?? []) {
    if (!isSuccessfulAbiogenesis(result)) continue;
    const preliminary = buildSuccessRecord(result, {
      gitCommit: batch.provenance?.gitCommit ?? commit,
      modelVersion: batch.provenance?.modelVersion ?? pkg.version,
      sourceBatch: path.basename(file),
    });
    const digest = crypto.createHash('sha256').update(stableJson({
      seed: preliminary.seed,
      numericSeed: preliminary.numericSeed,
      producingCommit: preliminary.producingCommit,
      model: preliminary.model,
      classification: preliminary.classification,
      abiogenesisTime: preliminary.abiogenesisTime,
      configuration: preliminary.configuration,
    })).digest('hex').slice(0, 20);
    const id = `abiogenesis-${digest}`;
    if (known.has(id)) continue;
    const record = { ...preliminary, id };
    const filename = `${id}.json`;
    fs.writeFileSync(path.join(successDir, filename), JSON.stringify(record, null, 2) + '\n');
    index.successes.push({
      id,
      classification: record.classification,
      seed: record.seed,
      abiogenesisTime: record.abiogenesisTime,
      producingCommit: record.producingCommit,
      modelVersion: record.model.version,
      path: `results/successes/${filename}`,
      recordedAt: record.recordedAt,
    });
    known.add(id);
    added++;
  }
}

if (added > 0) {
  index.successes.sort((a, b) => String(a.recordedAt).localeCompare(String(b.recordedAt)));
  index.updatedAt = new Date().toISOString();
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');
}
console.log(`Archived ${added} new abiogenesis success${added === 1 ? '' : 'es'}. Total: ${index.successes.length}.`);
