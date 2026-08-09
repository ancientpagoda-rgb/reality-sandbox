const REFRESH_SECONDS = 10.8;
const GENE_KEYS = [
  'multicellularity',
  'contractility',
  'digestion',
  'neuralComplexity',
  'bilateralBias',
  'appendagePropensity',
  'tissueRigidity',
  'aquaticAffinity',
  'terrestrialAffinity',
];

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number(v) || 0));

function hash32(text) {
  let h = 2166136261 >>> 0;
  const value = String(text);
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function hash01(text) {
  return hash32(text) / 4294967295;
}

function copyGenes(genes = {}) {
  const out = {};
  for (const key of GENE_KEYS) out[key] = clamp(genes[key]);
  return out;
}

function founderGenes(genome = {}, seed) {
  const r = key => hash01(`${seed}:${key}`);
  return {
    multicellularity: clamp(0.22 + (genome.bodySize || 0) * 0.42 + (genome.photosynthesis || 0) * 0.08 + r('multi') * 0.08),
    contractility: clamp(0.04 + (genome.motility || 0) * 0.62 + (genome.metabolism || 0) * 0.10 + r('contract') * 0.06),
    digestion: clamp(0.02 + (genome.heterotrophy || 0) * 0.68 + (genome.scavenging || 0) * 0.12 + r('digest') * 0.05),
    neuralComplexity: clamp(0.01 + (genome.brainSpeed || 0) * 0.54 + (genome.sense || 0) * 0.24 + r('neural') * 0.05),
    bilateralBias: clamp(0.08 + (genome.motility || 0) * 0.42 + (genome.sense || 0) * 0.20 + r('bilateral') * 0.08),
    appendagePropensity: clamp(0.02 + (genome.motility || 0) * 0.36 + (genome.bodySize || 0) * 0.10 + r('appendage') * 0.08),
    tissueRigidity: clamp(0.05 + (genome.armor || 0) * 0.56 + (genome.bodySize || 0) * 0.12 + r('rigidity') * 0.06),
    aquaticAffinity: clamp(0.35 + r('aquatic') * 0.42),
    terrestrialAffinity: clamp(0.10 + r('terrestrial') * 0.28),
  };
}

function mutateGenes(parent, seed, scale = 0.055) {
  const genes = copyGenes(parent);
  for (const key of GENE_KEYS) {
    genes[key] = clamp(genes[key] + (hash01(`${seed}:${key}`) - 0.5) * scale * 2);
  }
  return genes;
}

async function waitForRuntime() {
  while (true) {
    const morphogenesis = window.realitySandboxMorphogenesisV48;
    const planet = window.realitySandboxPlanet;
    const modules = window.realitySandboxModules;
    const motile = planet?.world?.ecs?.components?.motile;
    if (morphogenesis?.installed && motile instanceof Map && modules?.step) {
      return { morphogenesis, planet, modules, motile };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ planet, modules, motile }) {
  if (window.realitySandboxMorphogenesisInheritanceCacheV48a?.installed) return;

  const { world } = planet;
  const prototypes = new Map();
  let refreshAccumulator = 0;
  let birthsPreseeded = 0;
  let founderFallbacks = 0;
  let prototypeRefreshes = 0;
  let lastPopulation = motile.size;

  function refreshPrototypes() {
    const sums = new Map();
    for (const [, organism] of motile.entries()) {
      if (!organism?.lineageId || !organism.bioV48?.genes) continue;
      let bucket = sums.get(organism.lineageId);
      if (!bucket) {
        bucket = { count: 0, genes: Object.fromEntries(GENE_KEYS.map(key => [key, 0])) };
        sums.set(organism.lineageId, bucket);
      }
      bucket.count++;
      for (const key of GENE_KEYS) bucket.genes[key] += clamp(organism.bioV48.genes[key]);
    }
    for (const [lineageId, bucket] of sums.entries()) {
      const genes = {};
      for (const key of GENE_KEYS) genes[key] = clamp(bucket.genes[key] / Math.max(1, bucket.count));
      prototypes.set(lineageId, genes);
    }
    prototypeRefreshes++;
    lastPopulation = motile.size;
  }

  refreshPrototypes();

  const nativeSet = motile.set.bind(motile);
  motile.set = function cachedDevelopmentalInheritance(id, organism) {
    if (organism && !organism.bioV48 && organism.genome) {
      const lineageId = String(organism.lineageId || 'unclassified');
      const prototype = prototypes.get(lineageId);
      const seed = `${world.seed || 'nysa'}:v48a:${lineageId}:${id}:${organism.generation || 0}`;
      const genes = prototype
        ? mutateGenes(prototype, seed, 0.055)
        : founderGenes(organism.genome, seed);
      if (!prototype) founderFallbacks++;
      organism.bioV48 = { genes, phenotype: null, inheritedBy: 'v48a-lineage-cache' };
      if (!prototypes.has(lineageId)) prototypes.set(lineageId, copyGenes(genes));
      birthsPreseeded++;
    }
    return nativeSet(id, organism);
  };

  const previousStep = modules.step.bind(modules);
  modules.step = function v48aCachedInheritanceStep(dt) {
    const result = previousStep(dt);
    refreshAccumulator += Number(dt) || 0;
    if (refreshAccumulator >= REFRESH_SECONDS) {
      refreshAccumulator %= REFRESH_SECONDS;
      refreshPrototypes();
    }
    return result;
  };

  const api = {
    installed: true,
    refreshPrototypes,
    getPrototype(lineageId) {
      const genes = prototypes.get(String(lineageId));
      return genes ? copyGenes(genes) : null;
    },
    getStats: () => ({
      installed: true,
      lineagesCached: prototypes.size,
      birthsPreseeded,
      founderFallbacks,
      prototypeRefreshes,
      lastPopulation,
      refreshSeconds: REFRESH_SECONDS,
      birthInheritanceComplexity: 'O(1)',
      fullPopulationBirthSearchAvoided: true,
      hardPopulationCap: false,
      authoritativeFixedStep: true,
    }),
  };

  window.realitySandboxMorphogenesisInheritanceCacheV48a = api;
  document.documentElement.dataset.morphogenesisInheritanceV48a = 'lineage-cache-o1-births';
}

waitForRuntime().then(install);
