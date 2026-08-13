const SUCCESS_CLASSIFICATIONS = new Set(['sustained-darwinian-system', 'cellular-life']);

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableObject(value[key])]));
}

export function stableJson(value) {
  return JSON.stringify(stableObject(value));
}

export function isSuccessfulAbiogenesis(result) {
  return Boolean(result
    && result.lifeDetected === true
    && result.termination === 'life-detected'
    && SUCCESS_CLASSIFICATIONS.has(result.classification));
}

export function buildSuccessRecord(result, provenance = {}) {
  if (!isSuccessfulAbiogenesis(result)) {
    throw new Error(`Refusing to archive non-successful run: ${result?.classification ?? 'unknown'}`);
  }
  const gitCommit = String(provenance.gitCommit ?? result.provenance?.gitCommit ?? 'unknown');
  const modelVersion = String(provenance.modelVersion ?? result.provenance?.modelVersion ?? 'unknown');
  const idMaterial = stableJson({
    seed: result.seed,
    numericSeed: result.numericSeed,
    gitCommit,
    modelVersion,
    classification: result.classification,
    clock: result.clock,
    configuration: result.configuration ?? {},
  });
  const id = provenance.id ?? `pending:${idMaterial}`;
  return {
    schemaVersion: 1,
    kind: 'abiogenesis-success',
    id,
    recordedAt: provenance.recordedAt ?? new Date().toISOString(),
    classification: result.classification,
    abiogenesisTime: result.clock,
    seed: result.seed,
    numericSeed: result.numericSeed,
    producingCommit: gitCommit,
    model: {
      name: 'abiogenesis-lab',
      version: modelVersion,
      detectorSchemaVersion: 2,
    },
    configuration: result.configuration ?? {},
    verification: {
      lifeDetected: true,
      termination: result.termination,
      qualification: 'detector-qualified',
      terminalClassification: result.terminalDetection?.classification ?? result.classification,
    },
    evidence: result.evidence ?? {},
    metrics: result.metrics ?? {},
    evolution: result.evolution ?? {},
    terminalDetection: result.terminalDetection ?? null,
    steps: result.steps,
    sourceBatch: provenance.sourceBatch ?? null,
  };
}

export const SUCCESS_TYPES = [...SUCCESS_CLASSIFICATIONS];
