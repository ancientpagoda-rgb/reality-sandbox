import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { inflateRawSync } from 'node:zlib';

const ARCHIVE_URL = 'https://kenney.nl/media/pages/assets/nature-kit/37ac38a37b-1677698939/kenney_nature-kit.zip';
const ARCHIVE_SHA256 = 'fa797807cae9c3f434db849178bbc44109eee32533f07a9ae606ece46acad94c';
const OUTPUT_DIR = join(process.cwd(), 'public', 'vendor', 'kenney-nature-kit');
const MANIFEST_PATH = join(OUTPUT_DIR, 'manifest.json');

const MODELS = Object.freeze([
  { id: 'tree-default', file: 'tree_default.glb', role: 'general-tree' },
  { id: 'tree-oak', file: 'tree_oak.glb', role: 'temperate-tree' },
  { id: 'cactus-short', file: 'cactus_short.glb', role: 'arid-shrub' },
  { id: 'cactus-tall', file: 'cactus_tall.glb', role: 'arid-tall' },
]);

function buildManifest() {
  return {
    schema: 1,
    pack: 'Kenney Nature Kit 2.1',
    source: ARCHIVE_URL,
    archiveSha256: ARCHIVE_SHA256,
    license: 'CC0-1.0',
    attributionRequired: false,
    models: MODELS,
  };
}

async function alreadyVendored() {
  if (!existsSync(MANIFEST_PATH)) return false;
  try {
    const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
    if (manifest.archiveSha256 !== ARCHIVE_SHA256) return false;
    return MODELS.every(model => existsSync(join(OUTPUT_DIR, model.file)));
  } catch {
    return false;
  }
}

function findEndOfCentralDirectory(buffer) {
  const signature = 0x06054b50;
  const minimum = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimum; offset--) {
    if (buffer.readUInt32LE(offset) === signature) return offset;
  }
  throw new Error('Kenney archive has no ZIP central directory.');
}

function listZipEntries(buffer) {
  const eocd = findEndOfCentralDirectory(buffer);
  const totalEntries = buffer.readUInt16LE(eocd + 10);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  const entries = [];
  let offset = centralOffset;

  for (let index = 0; index < totalEntries; index++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error(`Invalid ZIP central entry ${index}.`);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    entries.push({ name, method, compressedSize, uncompressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function extractZipEntry(buffer, entry) {
  const offset = entry.localOffset;
  if (buffer.readUInt32LE(offset) !== 0x04034b50) throw new Error(`Invalid local ZIP header for ${entry.name}.`);
  const nameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const start = offset + 30 + nameLength + extraLength;
  const compressed = buffer.subarray(start, start + entry.compressedSize);
  let data;
  if (entry.method === 0) data = Buffer.from(compressed);
  else if (entry.method === 8) data = inflateRawSync(compressed);
  else throw new Error(`Unsupported ZIP compression method ${entry.method} for ${entry.name}.`);
  if (data.length !== entry.uncompressedSize) throw new Error(`ZIP size mismatch for ${entry.name}.`);
  return data;
}

async function downloadArchive() {
  const response = await fetch(ARCHIVE_URL, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Kenney Nature Kit download failed: HTTP ${response.status}.`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const digest = createHash('sha256').update(buffer).digest('hex');
  if (digest !== ARCHIVE_SHA256) {
    throw new Error(`Kenney Nature Kit SHA-256 mismatch: expected ${ARCHIVE_SHA256}, got ${digest}.`);
  }
  return buffer;
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  if (await alreadyVendored()) {
    console.log('CC0 plant models already vendored.');
    return;
  }

  const archive = await downloadArchive();
  const entries = listZipEntries(archive);
  const byBasename = new Map();
  for (const entry of entries) {
    const name = basename(entry.name);
    if (!name) continue;
    const bucket = byBasename.get(name) || [];
    bucket.push(entry);
    byBasename.set(name, bucket);
  }

  for (const model of MODELS) {
    const matches = byBasename.get(model.file) || [];
    if (matches.length !== 1) throw new Error(`Expected one ${model.file} in Kenney archive; found ${matches.length}.`);
    await writeFile(join(OUTPUT_DIR, model.file), extractZipEntry(archive, matches[0]));
  }

  await writeFile(MANIFEST_PATH, `${JSON.stringify(buildManifest(), null, 2)}\n`);
  await writeFile(join(OUTPUT_DIR, 'SOURCE.txt'), `Kenney Nature Kit 2.1\n${ARCHIVE_URL}\nSHA-256 ${ARCHIVE_SHA256}\n`);
  await writeFile(join(OUTPUT_DIR, 'LICENSE.txt'), 'CC0 1.0 Universal (CC0-1.0). Kenney states its game assets are public-domain/CC0 and may be used without attribution.\n');
  console.log(`Vendored ${MODELS.length} CC0 plant models from Kenney Nature Kit.`);
}

main().catch(error => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
