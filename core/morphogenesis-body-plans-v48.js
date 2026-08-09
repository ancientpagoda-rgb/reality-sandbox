import { samplePlanet } from './planet.js';
import { sampleHydrology } from './hydrology.js';

const STEP_SECONDS = 3.6;
const PLANT_INHERIT_RADIUS = 70;
const MOTILE_INHERIT_RADIUS = 28;

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number(v) || 0));
const wrap = (v, max) => ((v % max) + max) % max;

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

function wrappedDelta(a, b, size) {
  let d = a - b;
  if (d > size * 0.5) d -= size;
  if (d < -size * 0.5) d += size;
  return d;
}

function distance(a, b, world) {
  return Math.hypot(wrappedDelta(a.x, b.x, world.width), wrappedDelta(a.y, b.y, world.height));
}

function copyGenes(g) {
  return {
    multicellularity: clamp(g.multicellularity),
    contractility: clamp(g.contractility),
    digestion: clamp(g.digestion),
    neuralComplexity: clamp(g.neuralComplexity),
    bilateralBias: clamp(g.bilateralBias),
    appendagePropensity: clamp(g.appendagePropensity),
    tissueRigidity: clamp(g.tissueRigidity),
    aquaticAffinity: clamp(g.aquaticAffinity),
    terrestrialAffinity: clamp(g.terrestrialAffinity),
  };
}

function founderGenes(genome, seed) {
  const g = genome || {};
  const r = key => hash01(`${seed}:${key}`);
  return {
    multicellularity: clamp(0.22 + (g.bodySize || 0) * 0.42 + (g.photosynthesis || 0) * 0.08 + r('multi') * 0.08),
    contractility: clamp(0.04 + (g.motility || 0) * 0.62 + (g.metabolism || 0) * 0.10 + r('contract') * 0.06),
    digestion: clamp(0.02 + (g.heterotrophy || 0) * 0.68 + (g.scavenging || 0) * 0.12 + r('digest') * 0.05),
    neuralComplexity: clamp(0.01 + (g.brainSpeed || 0) * 0.54 + (g.sense || 0) * 0.24 + r('neural') * 0.05),
    bilateralBias: clamp(0.08 + (g.motility || 0) * 0.42 + (g.sense || 0) * 0.20 + r('bilateral') * 0.08),
    appendagePropensity: clamp(0.02 + (g.motility || 0) * 0.36 + (g.bodySize || 0) * 0.10 + r('appendage') * 0.08),
    tissueRigidity: clamp(0.05 + (g.armor || 0) * 0.56 + (g.bodySize || 0) * 0.12 + r('rigidity') * 0.06),
    aquaticAffinity: clamp(0.35 + r('aquatic') * 0.42),
    terrestrialAffinity: clamp(0.10 + r('terrestrial') * 0.28),
  };
}

function mutateGenes(parent, seed, scale = 0.045) {
  const out = copyGenes(parent);
  for (const key of Object.keys(out)) {
    const delta = (hash01(`${seed}:${key}`) - 0.5) * scale * 2;
    out[key] = clamp(out[key] + delta);
  }
  return out;
}

function waterAccessAt(x, y, world) {
  const h = sampleHydrology(x, y, world.width, world.height) || {};
  return clamp((Number(h.river) || 0) * 0.45 + (Number(h.lake) || 0) * 0.50 + (Number(h.delta) || 0) * 0.55 + (Number(h.flood) || 0) * 0.12);
}

function phenotypeFor(v47, genes, waterAccess = 0.2) {
  const g = v47 || {};
  const developmental = genes || {};
  const bilateral = developmental.bilateralBias > 0.48 && (g.motility || 0) > 0.20;
  const appendages = Math.max(0, Math.min(10, Math.round(developmental.appendagePropensity * 7 + developmental.bilateralBias * 2)));
  const neural = clamp(developmental.neuralComplexity);
  const contractile = clamp(developmental.contractility);
  const digestive = clamp(developmental.digestion);
  const aquaticFit = clamp(developmental.aquaticAffinity * (0.35 + waterAccess * 0.65));
  const terrestrialFit = clamp(developmental.terrestrialAffinity * (1 - waterAccess * 0.65));

  let bodyPlan = 'sessile colonial form';
  if ((g.motility || 0) > 0.16 || contractile > 0.22) bodyPlan = 'creeping colonial form';
  if ((g.motility || 0) > 0.28 && developmental.multicellularity > 0.34) {
    bodyPlan = aquaticFit >= terrestrialFit ? 'free-swimming mixotroph' : 'soft-bodied crawler';
  }
  if (digestive > 0.42 && (g.heterotrophy || 0) > 0.34) {
    if ((g.aggression || 0) > 0.48) bodyPlan = aquaticFit >= terrestrialFit ? 'swimming predator' : 'cursorial predator';
    else if ((g.scavenging || 0) > 0.44) bodyPlan = 'mobile scavenger';
    else bodyPlan = aquaticFit >= terrestrialFit ? 'aquatic grazer' : 'terrestrial grazer';
  }
  if (neural > 0.52 && bilateral && appendages >= 2 && digestive > 0.48) {
    bodyPlan = (g.aggression || 0) > 0.52 ? 'complex bilateral predator' : 'complex bilateral grazer';
  }

  return {
    bodyPlan,
    symmetry: bilateral ? 'bilateral' : developmental.multicellularity > 0.46 ? 'radial/irregular' : 'colonial',
    appendages,
    multicellularity: developmental.multicellularity,
    contractility: contractile,
    digestion: digestive,
    neuralComplexity: neural,
    tissueRigidity: developmental.tissueRigidity,
    locomotion: aquaticFit >= terrestrialFit ? 'aquatic' : 'terrestrial',
    aquaticFit,
    terrestrialFit,
    animalLikeScore: clamp(
      developmental.multicellularity * 0.16 +
      contractile * 0.17 +
      digestive * 0.18 +
      neural * 0.15 +
      developmental.bilateralBias * 0.12 +
      developmental.appendagePropensity * 0.10 +
      (g.heterotrophy || 0) * 0.12
    ),
  };
}

async function waitForRuntime() {
  while (true) {
    const origin = window.realitySandboxOriginMotileLifeV47;
    const inspector = window.realitySandboxEvolutionInspectorV47b;
    const modules = window.realitySandboxModules;
    const planet = window.realitySandboxPlanet;
    const host = document.getElementById('evolutionInspectorV47bHost');
    if (origin?.installed && inspector?.installed && modules?.step && planet?.world?.ecs?.components && host?.shadowRoot) {
      return { origin, inspector, modules, planet, root: host.shadowRoot };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ origin, inspector, modules, planet, root }) {
  if (window.realitySandboxMorphogenesisV48?.installed) return;

  const { world } = planet;
  const { resource, motile, position, velocity } = world.ecs.components;
  let accumulator = 0;
  let steps = 0;
  const lineagePhenotypes = new Map();
  const transitions = [];
  const previousPlan = new Map();

  function nearestPlantParent(id, lineageId, p) {
    let best = null;
    let bestD = PLANT_INHERIT_RADIUS;
    for (const [otherId, res] of resource.entries()) {
      if (otherId === id || res.bioV47?.lineageId !== lineageId || !res.bioV48?.genes) continue;
      const op = position.get(otherId);
      if (!op) continue;
      const d = distance(p, op, world);
      if (d < bestD) { bestD = d; best = res.bioV48; }
    }
    return best;
  }

  function nearestMotileParent(id, organism, p) {
    let best = null;
    let bestD = MOTILE_INHERIT_RADIUS;
    for (const [otherId, other] of motile.entries()) {
      if (otherId === id || !other.bioV48?.genes) continue;
      if (Math.abs((other.generation || 0) - (organism.generation || 0)) > 1 && other.lineageId !== organism.lineageId) continue;
      const op = position.get(otherId);
      if (!op) continue;
      const d = distance(p, op, world);
      if (d < bestD) { bestD = d; best = other.bioV48; }
    }
    return best;
  }

  function ensurePlantDevelopment() {
    for (const [id, res] of resource.entries()) {
      if (!res.bioV47 || res.bioV48) continue;
      const p = position.get(id);
      if (!p) continue;
      const parent = nearestPlantParent(id, res.bioV47.lineageId, p);
      const genes = parent?.genes
        ? mutateGenes(parent.genes, `${world.seed}:plant:${id}:${res.bioV47.generation || 0}`, 0.025)
        : founderGenes(res.bioV47.genome, `${world.seed}:plant-founder:${res.bioV47.lineageId}:${id}`);
      res.bioV48 = { genes, phenotype: phenotypeFor(res.bioV47.genome, genes, waterAccessAt(p.x, p.y, world)) };
    }
  }

  function ensureMotileDevelopment() {
    for (const [id, organism] of motile.entries()) {
      if (organism.bioV48) continue;
      const p = position.get(id);
      if (!p) continue;
      const parent = nearestMotileParent(id, organism, p);
      const genes = parent?.genes
        ? mutateGenes(parent.genes, `${world.seed}:motile:${id}:${organism.generation || 0}`, 0.055)
        : founderGenes(organism.genome, `${world.seed}:motile-founder:${organism.lineageId}:${id}`);
      organism.bioV48 = { genes, phenotype: phenotypeFor(organism.genome, genes, waterAccessAt(p.x, p.y, world)) };
    }
  }

  function evolveGenes(genes, v47, p, dt, mobile) {
    const terrain = samplePlanet(p.x, p.y, world.width, world.height) || {};
    const water = waterAccessAt(p.x, p.y, world);
    const land = Boolean(terrain.land);
    const moisture = clamp(Number(terrain.rainfall) || 0.5);
    const push = (key, pressure, rate) => { genes[key] = clamp(genes[key] + pressure * dt * rate); };

    push('multicellularity', (v47.bodySize || 0) * 0.30 + (v47.heterotrophy || 0) * 0.16 + (v47.armor || 0) * 0.10, 0.0022);
    push('contractility', (v47.motility || 0) * 0.54 + (v47.metabolism || 0) * 0.12, 0.0026);
    push('digestion', (v47.heterotrophy || 0) * 0.52 + (v47.scavenging || 0) * 0.18, 0.0026);
    push('neuralComplexity', (v47.brainSpeed || 0) * 0.46 + (v47.sense || 0) * 0.26 + (v47.aggression || 0) * 0.06, 0.0021);
    push('bilateralBias', (v47.motility || 0) * (v47.sense || 0) * 0.40 + genes.contractility * 0.10, 0.0018);
    push('appendagePropensity', genes.contractility * genes.bilateralBias * 0.34 + (land ? 0.08 : 0.02), 0.0018);
    push('tissueRigidity', (v47.armor || 0) * 0.30 + (land ? 0.09 : 0.02) + (1 - moisture) * 0.04, 0.0015);
    push('aquaticAffinity', water * 0.34 - (land && water < 0.2 ? 0.04 : 0), 0.0014);
    push('terrestrialAffinity', (land ? 0.22 : -0.04) + (1 - water) * 0.10, 0.0012);

    if (mobile) {
      const complexityCost = genes.neuralComplexity * 0.0026 + genes.contractility * 0.0023 + genes.tissueRigidity * 0.0014;
      mobile.energy = Math.max(0, (mobile.energy || 0) - complexityCost * dt);
      const fit = clamp(genes.aquaticAffinity * water + genes.terrestrialAffinity * (1 - water));
      const vel = velocity.get(mobile.id);
      if (vel) {
        const multiplier = 0.985 + fit * 0.03 + genes.contractility * 0.018;
        vel.vx *= multiplier;
        vel.vy *= multiplier;
      }
    }
  }

  function registerTransition(id, lineageId, phenotype) {
    const before = previousPlan.get(id);
    if (before && before !== phenotype.bodyPlan) {
      transitions.push({ entityId: id, lineageId, tick: world.tick, from: before, to: phenotype.bodyPlan, animalLikeScore: phenotype.animalLikeScore });
      if (transitions.length > 240) transitions.splice(0, transitions.length - 240);
    }
    previousPlan.set(id, phenotype.bodyPlan);
  }

  function stepMorphogenesis(dt) {
    ensurePlantDevelopment();
    ensureMotileDevelopment();

    for (const [id, res] of resource.entries()) {
      if (!res.bioV47?.genome || !res.bioV48?.genes) continue;
      const p = position.get(id);
      if (!p) continue;
      evolveGenes(res.bioV48.genes, res.bioV47.genome, p, dt, null);
      res.bioV48.phenotype = phenotypeFor(res.bioV47.genome, res.bioV48.genes, waterAccessAt(p.x, p.y, world));
      registerTransition(id, res.bioV47.lineageId, res.bioV48.phenotype);
    }

    for (const [id, organism] of motile.entries()) {
      if (!organism.genome || !organism.bioV48?.genes) continue;
      const p = position.get(id);
      if (!p) continue;
      const mobile = { ...organism, id };
      evolveGenes(organism.bioV48.genes, organism.genome, p, dt, mobile);
      organism.energy = mobile.energy;
      organism.bioV48.phenotype = phenotypeFor(organism.genome, organism.bioV48.genes, waterAccessAt(p.x, p.y, world));
      registerTransition(id, organism.lineageId, organism.bioV48.phenotype);
    }

    recountLineages();
    steps++;
  }

  function recountLineages() {
    const buckets = new Map();
    const add = (lineageId, phenotype) => {
      if (!lineageId || !phenotype) return;
      let bucket = buckets.get(lineageId);
      if (!bucket) buckets.set(lineageId, bucket = { count: 0, animalLike: 0, neural: 0, contractile: 0, digestion: 0, appendages: 0, plans: new Map() });
      bucket.count++;
      bucket.animalLike += phenotype.animalLikeScore;
      bucket.neural += phenotype.neuralComplexity;
      bucket.contractile += phenotype.contractility;
      bucket.digestion += phenotype.digestion;
      bucket.appendages += phenotype.appendages;
      bucket.plans.set(phenotype.bodyPlan, (bucket.plans.get(phenotype.bodyPlan) || 0) + 1);
    };
    for (const [, res] of resource.entries()) add(res.bioV47?.lineageId, res.bioV48?.phenotype);
    for (const [, organism] of motile.entries()) add(organism.lineageId, organism.bioV48?.phenotype);
    lineagePhenotypes.clear();
    for (const [lineageId, bucket] of buckets) {
      const dominant = [...bucket.plans.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
      lineagePhenotypes.set(lineageId, {
        lineageId,
        population: bucket.count,
        dominantBodyPlan: dominant,
        animalLikeScore: bucket.animalLike / bucket.count,
        neuralComplexity: bucket.neural / bucket.count,
        contractility: bucket.contractile / bucket.count,
        digestion: bucket.digestion / bucket.count,
        meanAppendages: bucket.appendages / bucket.count,
      });
    }
  }

  const style = document.createElement('style');
  style.textContent = `
    .body-plan-v48 { margin-top:11px; padding:9px; border-radius:9px; background:rgba(255,255,255,.035); }
    .body-plan-v48 h3 { margin:0 0 7px; font-size:9px; letter-spacing:.12em; text-transform:uppercase; opacity:.58; }
    .body-plan-grid-v48 { display:grid; grid-template-columns:repeat(3,1fr); gap:5px; }
    .body-plan-grid-v48 div { padding:6px; border-radius:7px; background:rgba(255,255,255,.035); }
    .body-plan-grid-v48 b { display:block; font-size:10px; line-height:1.15; }
    .body-plan-grid-v48 span { display:block; margin-top:2px; font-size:7px; opacity:.48; text-transform:uppercase; }
  `;
  root.appendChild(style);
  const morphology = root.querySelector('.morphology-card');
  const box = document.createElement('div');
  box.className = 'body-plan-v48';
  box.innerHTML = '<h3>Morphogenesis v48</h3><div class="body-plan-grid-v48"></div>';
  morphology?.insertAdjacentElement('afterend', box);

  function render() {
    const selected = inspector.getStats?.().selectedLineageId;
    const phenotype = selected ? lineagePhenotypes.get(selected) : null;
    const grid = box.querySelector('.body-plan-grid-v48');
    if (!grid) return;
    if (!phenotype) {
      grid.innerHTML = '<div><b>—</b><span>body plan</span></div>';
      return;
    }
    grid.innerHTML = [
      [phenotype.dominantBodyPlan, 'body plan'],
      [`${Math.round(phenotype.animalLikeScore * 100)}%`, 'animal-like'],
      [`${phenotype.meanAppendages.toFixed(1)}`, 'appendages'],
      [`${Math.round(phenotype.neuralComplexity * 100)}%`, 'neural'],
      [`${Math.round(phenotype.contractility * 100)}%`, 'contractile'],
      [`${Math.round(phenotype.digestion * 100)}%`, 'digestion'],
    ].map(([value, label]) => `<div><b>${value}</b><span>${label}</span></div>`).join('');
  }

  const previousStep = modules.step.bind(modules);
  modules.step = function v48MorphogenesisStep(dt) {
    const result = previousStep(dt);
    accumulator += dt;
    if (accumulator >= STEP_SECONDS) {
      const elapsed = accumulator;
      accumulator = 0;
      stepMorphogenesis(elapsed);
      render();
    }
    return result;
  };

  root.querySelector('.lineage-select')?.addEventListener('change', () => queueMicrotask(render));

  const api = {
    installed: true,
    getLineagePhenotypes: () => [...lineagePhenotypes.values()].map(item => ({ ...item })),
    getPhenotypeForEntity(id) {
      const organism = motile.get(id);
      if (organism?.bioV48?.phenotype) return { ...organism.bioV48.phenotype, genes: copyGenes(organism.bioV48.genes) };
      const res = resource.get(id);
      if (res?.bioV48?.phenotype) return { ...res.bioV48.phenotype, genes: copyGenes(res.bioV48.genes) };
      return null;
    },
    getTransitions: lineageId => transitions.filter(item => !lineageId || item.lineageId === lineageId).map(item => ({ ...item })),
    render,
    getStats: () => ({
      installed: true,
      steps,
      trackedLineages: lineagePhenotypes.size,
      transitions: transitions.length,
      heritableDevelopmentalTraits: true,
      plantToAnimalMorphogenesis: true,
      hardPopulationCap: false,
      surfaceRendererEnabled: false,
      authoritativeFixedStep: true,
      traits: ['multicellularity','contractility','digestion','neuralComplexity','bilateralBias','appendagePropensity','tissueRigidity','aquaticAffinity','terrestrialAffinity'],
    }),
  };

  window.realitySandboxMorphogenesisV48 = api;
  document.documentElement.dataset.morphogenesisV48 = 'heritable-body-plans';

  stepMorphogenesis(0);
  render();
}

waitForRuntime().then(install);
