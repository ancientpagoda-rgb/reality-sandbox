import { mulberry32 } from './rng.js';

const R_KJ = 0.008314462618;
const EPSILON = 1e-10;
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const saturate = (value, scale) => clamp(value / Math.max(EPSILON, value + scale));

export const SPECIES = Object.freeze({
  water: { formula: { H: 2, O: 1 }, mobile: 0.12 },
  hydrogen: { formula: { H: 2 }, mobile: 0.22 },
  carbonDioxide: { formula: { C: 1, O: 2 }, mobile: 0.16 },
  carbonMonoxide: { formula: { C: 1, O: 1 }, mobile: 0.17 },
  nitrogen: { formula: { N: 2 }, mobile: 0.12 },
  ammonia: { formula: { N: 1, H: 3 }, mobile: 0.14 },
  hydrogenSulfide: { formula: { H: 2, S: 1 }, mobile: 0.13 },
  ferrousOxide: { formula: { Fe: 1, O: 1 }, mobile: 0.001 },
  magnetite: { formula: { Fe: 3, O: 4 }, mobile: 0.001 },
  phosphate: { formula: { H: 3, P: 1, O: 4 }, mobile: 0.045 },
  methane: { formula: { C: 1, H: 4 }, mobile: 0.18 },
  reducedCarbon: { formula: { C: 1, H: 2, O: 1 }, mobile: 0.09 },
  formamide: { formula: { C: 1, H: 3, N: 1, O: 1 }, mobile: 0.075 },
  amphiphile: { formula: { C: 8, H: 16, O: 2 }, mobile: 0.018 },
  condensate: { formula: { C: 2, H: 4, N: 2, O: 1 }, mobile: 0.025 }
});

export const REACTIONS = Object.freeze([
  { id: 'water-rock-hydrogen-generation', reactants: { ferrousOxide: 3, water: 1 }, products: { magnetite: 1, hydrogen: 1 }, deltaG0: -42, activationEnergy: 68, prefactor: 2.4e9, mineralCatalysis: 18, hydrothermalCatalysis: 32 },
  { id: 'carbon-reduction-to-methane', reactants: { carbonDioxide: 1, hydrogen: 4 }, products: { methane: 1, water: 2 }, deltaG0: -130, activationEnergy: 74, prefactor: 3e10, mineralCatalysis: 34, hydrothermalCatalysis: 18 },
  { id: 'energy-driven-carbon-fixation', reactants: { carbonDioxide: 1, hydrogen: 2 }, products: { reducedCarbon: 1, water: 1 }, deltaG0: 38, activationEnergy: 86, prefactor: 1.2e11, mineralCatalysis: 30, hydrothermalCatalysis: 22, energyCoupling: 72 },
  { id: 'abiotic-nitrogen-fixation', reactants: { nitrogen: 1, hydrogen: 3 }, products: { ammonia: 2 }, deltaG0: -33, activationEnergy: 118, prefactor: 2e12, mineralCatalysis: 42, ultravioletCatalysis: 25, energyCoupling: 20 },
  { id: 'carbon-nitrogen-coupling', reactants: { reducedCarbon: 1, ammonia: 1 }, products: { formamide: 1, hydrogen: 1 }, deltaG0: 24, activationEnergy: 82, prefactor: 1.8e11, mineralCatalysis: 24, wetDryCatalysis: 24, energyCoupling: 54 },
  { id: 'amphiphile-condensation', reactants: { reducedCarbon: 8, hydrogen: 6 }, products: { amphiphile: 1, water: 6 }, deltaG0: 96, activationEnergy: 82, prefactor: 8e11, mineralCatalysis: 38, wetDryCatalysis: 52, energyCoupling: 190 },
  { id: 'nitrogenous-condensation', reactants: { formamide: 2 }, products: { condensate: 1, water: 1 }, deltaG0: 31, activationEnergy: 91, prefactor: 6e11, mineralCatalysis: 20, wetDryCatalysis: 35, ultravioletCatalysis: 11, energyCoupling: 70 },
  { id: 'formamide-photolysis', reactants: { formamide: 1 }, products: { carbonMonoxide: 1, ammonia: 1 }, deltaG0: 18, activationEnergy: 76, prefactor: 7e10, ultravioletCatalysis: 48, energyCoupling: 58 },
  { id: 'condensate-hydrolysis', reactants: { condensate: 1, water: 1 }, products: { formamide: 2 }, deltaG0: -12, activationEnergy: 63, prefactor: 5e9, hydrothermalCatalysis: 10 },
  { id: 'amphiphile-hydrolysis', reactants: { amphiphile: 1, water: 6 }, products: { reducedCarbon: 8, hydrogen: 6 }, deltaG0: -8, activationEnergy: 104, prefactor: 4e9, hydrothermalCatalysis: 8, ultravioletCatalysis: 11 }
]);

verifyReactionStoichiometry();

export function createPhysicalChemicalKernel(options = {}) {
  const columns = Math.max(1, Math.floor(options.columns ?? 24));
  const rows = Math.max(1, Math.floor(options.rows ?? 12));
  const size = columns * rows;
  const environment = options.environment ?? {};
  const star = options.star ?? {};
  const disk = options.disk ?? {};
  const planet = options.planet ?? {};
  const rng = mulberry32(options.seed ?? 1);
  const species = Object.fromEntries(Object.keys(SPECIES).map(name => [name, new Float64Array(size)]));
  const scratch = Object.fromEntries(Object.keys(SPECIES).map(name => [name, new Float64Array(size)]));
  const fields = Object.fromEntries([
    'temperatureK', 'pressureBar', 'energyFlux', 'organics', 'amphiphiles', 'precursors', 'complexity', 'reactionActivity', 'compartmentPotential', 'selfMaintenance'
  ].map(name => [name, new Float32Array(size)]));
  const elementNames = ['H', 'C', 'N', 'O', 'P', 'S', 'Fe'];
  const initialTotals = new Float64Array(elementNames.length);
  const externalTotals = new Float64Array(elementNames.length);
  let clock = 0;
  let lastMetrics = null;

  seedInventory();
  captureElementTotals(initialTotals);
  refreshDerived();
  recalculateMetrics();

  function env(name, index, fallback) {
    const values = environment[name];
    return values && Number.isFinite(values[index]) ? values[index] : fallback;
  }

  function seedInventory() {
    const metallicity = clamp(Number(star.metallicity ?? 0), -2.5, 0.7);
    const metalScale = clamp(10 ** metallicity, 0.03, 4);
    const carbonToOxygen = clamp(Number(disk.carbonToOxygen ?? 0.55), 0.15, 1.4);
    const atmosphere = clamp(Number(planet.atmosphereRetention ?? 0.5), 0.02, 1);
    const waterFraction = clamp(Number(planet.waterFraction ?? 0.25));
    const rocky = String(planet.composition ?? '').includes('rocky');
    const carbonScale = clamp(metalScale * (0.55 + carbonToOxygen * 0.9), 0.03, 3.5);
    const nitrogenScale = clamp(metalScale * 0.78, 0.02, 2.8);
    const phosphorusScale = clamp(metalScale * (rocky ? 1 : 0.35), 0.01, 2.2);
    const sulfurScale = clamp(metalScale * 0.95, 0.02, 3);
    for (let i = 0; i < size; i++) {
      const water = clamp(env('water', i, waterFraction));
      const minerals = clamp(env('minerals', i, rocky ? 0.6 : 0.25));
      const hydro = clamp(env('hydrothermal', i, 0.1));
      const wetDry = clamp(env('wetDry', i, 0.08));
      const uv = clamp(env('ultraviolet', i, 0.2), 0, 1.5);
      const tNorm = clamp(env('temperature', i, 0.58));
      const baseT = clamp(Number(planet.equilibriumTemperature ?? 285), 120, 800);
      fields.temperatureK[i] = clamp(baseT + (tNorm - 0.58) * 125 + hydro * 55, 165, 520);
      fields.pressureBar[i] = clamp(0.03 + atmosphere ** 1.7 * (0.55 + (Number(planet.massEarth ?? 1)) ** 0.35), 0.02, 20);
      fields.energyFlux[i] = clamp(hydro * 0.58 + uv * 0.24 + wetDry * 0.28, 0, 1.8);
      species.water[i] = 0.4 + water * 3.6;
      species.hydrogen[i] = 0.012 + hydro * 0.46 + minerals * 0.035;
      species.carbonDioxide[i] = (0.055 + atmosphere * 0.24) * carbonScale * (0.7 + rng() * 0.12);
      species.carbonMonoxide[i] = hydro * 0.004 * carbonScale;
      species.nitrogen[i] = (0.08 + atmosphere * 0.28) * nitrogenScale * (0.82 + rng() * 0.1);
      species.hydrogenSulfide[i] = (0.002 + hydro * 0.055) * sulfurScale;
      species.ferrousOxide[i] = minerals * metalScale * (0.18 + hydro * 0.12);
      species.magnetite[i] = minerals * metalScale * 0.015;
      species.phosphate[i] = (0.00018 + minerals * 0.0028 + wetDry * 0.0016) * phosphorusScale;
    }
  }

  function step(dt = 0.1) {
    const simDt = clamp(Number(dt) || 0, 0, 1);
    if (!simDt) return getMetrics();
    clock += simDt;
    diffuse(simDt);
    fields.reactionActivity.fill(0);
    for (let i = 0; i < size; i++) {
      for (const reaction of REACTIONS) fields.reactionActivity[i] += applyReaction(i, reaction, simDt);
    }
    refreshDerived();
    recalculateMetrics();
    return getMetrics();
  }

  function applyReaction(index, reaction, dt) {
    const temperature = fields.temperatureK[index];
    const minerals = clamp(env('minerals', index, 0.4));
    const hydro = clamp(env('hydrothermal', index, 0.1));
    const wetDry = clamp(env('wetDry', index, 0.1));
    const uv = clamp(env('ultraviolet', index, 0.1), 0, 1.5);
    const catalystReduction = minerals * (reaction.mineralCatalysis ?? 0)
      + hydro * (reaction.hydrothermalCatalysis ?? 0)
      + wetDry * (reaction.wetDryCatalysis ?? 0)
      + uv * (reaction.ultravioletCatalysis ?? 0);
    const activation = Math.max(8, reaction.activationEnergy - catalystReduction);
    const arrhenius = reaction.prefactor * Math.exp(-activation / (R_KJ * temperature));
    const q = reactionQuotient(index, reaction);
    const deltaG = reaction.deltaG0 + R_KJ * temperature * Math.log(Math.max(EPSILON, q));
    const effectiveDeltaG = deltaG - fields.energyFlux[index] * (reaction.energyCoupling ?? 0);
    const drive = effectiveDeltaG < 0 ? clamp(1 - Math.exp(effectiveDeltaG / Math.max(EPSILON, R_KJ * temperature))) : 0;
    if (!drive) return 0;
    let availability = 1, limiting = Infinity;
    for (const [name, coefficient] of Object.entries(reaction.reactants)) {
      const amount = Math.max(0, species[name][index]);
      availability *= amount / (1 + amount);
      limiting = Math.min(limiting, amount / coefficient);
    }
    if (!Number.isFinite(limiting) || limiting <= EPSILON) return 0;
    const extent = Math.min(limiting * 0.22, arrhenius * availability * drive * dt * 2.5e-6);
    if (extent <= EPSILON) return 0;
    for (const [name, coefficient] of Object.entries(reaction.reactants)) species[name][index] = Math.max(0, species[name][index] - extent * coefficient);
    for (const [name, coefficient] of Object.entries(reaction.products)) species[name][index] += extent * coefficient;
    return extent;
  }

  function reactionQuotient(index, reaction) {
    let numerator = 1, denominator = 1;
    for (const [name, coefficient] of Object.entries(reaction.products)) numerator *= activity(species[name][index]) ** coefficient;
    for (const [name, coefficient] of Object.entries(reaction.reactants)) denominator *= activity(species[name][index]) ** coefficient;
    return numerator / Math.max(EPSILON, denominator);
  }

  function activity(amount) { return Math.max(EPSILON, amount / (1 + amount)); }

  function diffuse(dt) {
    for (const [name, definition] of Object.entries(SPECIES)) {
      const coefficient = definition.mobile * dt;
      const source = species[name], target = scratch[name];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < columns; c++) {
          const i = r * columns + c;
          const north = Math.max(0, r - 1) * columns + c;
          const south = Math.min(rows - 1, r + 1) * columns + c;
          const west = r * columns + ((c - 1 + columns) % columns);
          const east = r * columns + ((c + 1) % columns);
          const average = (source[north] + source[south] + source[west] + source[east]) * 0.25;
          target[i] = Math.max(0, source[i] + (average - source[i]) * coefficient);
        }
      }
      source.set(target);
    }
  }

  function refreshDerivedCell(i) {
    const reduced = species.reducedCarbon[i], formamide = species.formamide[i];
    const amphiphile = species.amphiphile[i], condensate = species.condensate[i];
    const phosphate = species.phosphate[i], methane = species.methane[i];
    fields.organics[i] = saturate(reduced * 0.52 + formamide * 0.9 + amphiphile * 2.8 + condensate * 1.35 + methane * 0.08, 0.22);
    // Amphiphile is an explicit molecular inventory; this dimensionless field
    // represents local self-assembly potential rather than bulk abundance.
    fields.amphiphiles[i] = saturate(amphiphile, 2.5e-4);
    fields.precursors[i] = saturate(Math.min(formamide * 1.7 + condensate * 2.2, phosphate * 120) + reduced * 0.14, 0.055);
    fields.complexity[i] = diversity(i);
    const water = clamp(env('water', i, 0.5));
    const wetDry = clamp(env('wetDry', i, 0.1));
    fields.compartmentPotential[i] = clamp(fields.amphiphiles[i] * (0.45 + water * 0.35 + wetDry * 0.2));
    const maintenanceFlux = fields.organics[i] * fields.precursors[i] * fields.energyFlux[i] * (0.35 + fields.reactionActivity[i] * 80);
    fields.selfMaintenance[i] = saturate(maintenanceFlux, 2e-5);
  }

  function refreshDerived() {
    for (let i = 0; i < size; i++) refreshDerivedCell(i);
  }

  function diversity(index) {
    const values = ['methane', 'reducedCarbon', 'formamide', 'amphiphile', 'condensate'].map(name => species[name][index]).filter(value => value > EPSILON);
    const total = values.reduce((sum, value) => sum + value, 0);
    if (total <= EPSILON) return 0;
    let entropy = 0;
    for (const value of values) { const p = value / total; entropy -= p * Math.log(p); }
    return clamp(entropy / Math.log(5));
  }

  function captureElementTotals(target) {
    target.fill(0);
    for (let i = 0; i < size; i++) {
      for (const [name, definition] of Object.entries(SPECIES)) {
        for (let e = 0; e < elementNames.length; e++) target[e] += species[name][i] * (definition.formula[elementNames[e]] ?? 0);
      }
    }
  }

  function addExternalMaterial(name, amount, direction = 1) {
    const definition = SPECIES[name];
    if (!definition || !amount) return;
    for (let e = 0; e < elementNames.length; e++) {
      externalTotals[e] += direction * amount * (definition.formula[elementNames[e]] ?? 0);
      if (Math.abs(externalTotals[e]) < EPSILON) externalTotals[e] = 0;
    }
  }

  function withdraw(index, requests = {}) {
    if (index < 0 || index >= size) return { scale: 0, bundle: {} };
    let scale = 1;
    let requestedAnything = false;
    for (const [name, requested] of Object.entries(requests)) {
      if (!SPECIES[name]) throw new Error(`Unknown species ${name}`);
      const amount = Math.max(0, Number(requested) || 0);
      if (!amount) continue;
      requestedAnything = true;
      scale = Math.min(scale, species[name][index] / amount);
    }
    if (!requestedAnything) return { scale: 0, bundle: {} };
    scale = clamp(scale, 0, 1);
    const bundle = {};
    for (const [name, requested] of Object.entries(requests)) {
      const amount = Math.max(0, Number(requested) || 0) * scale;
      if (!amount) continue;
      species[name][index] = Math.max(0, species[name][index] - amount);
      addExternalMaterial(name, amount, 1);
      bundle[name] = amount;
    }
    refreshDerivedCell(index);
    return { scale, bundle };
  }

  function deposit(index, bundle = {}) {
    if (index < 0 || index >= size) return false;
    for (const [name, rawAmount] of Object.entries(bundle)) {
      if (!SPECIES[name]) throw new Error(`Unknown species ${name}`);
      const amount = Math.max(0, Number(rawAmount) || 0);
      if (!amount) continue;
      species[name][index] += amount;
      addExternalMaterial(name, amount, -1);
    }
    refreshDerivedCell(index);
    return true;
  }

  function maxElementDrift() {
    const current = new Float64Array(elementNames.length);
    captureElementTotals(current);
    let max = 0;
    for (let i = 0; i < current.length; i++) {
      const represented = current[i] + externalTotals[i];
      max = Math.max(max, Math.abs(represented - initialTotals[i]) / Math.max(EPSILON, initialTotals[i]));
    }
    return max;
  }

  function recalculateMetrics() {
    const sums = { organics: 0, amphiphiles: 0, precursors: 0, complexity: 0, energyFlux: 0, reactionActivity: 0, compartmentPotential: 0, selfMaintenance: 0 };
    const maxima = { complexity: 0, compartmentPotential: 0, selfMaintenance: 0, organics: 0, precursors: 0, amphiphiles: 0 };
    let active = 0;
    for (let i = 0; i < size; i++) {
      for (const key of Object.keys(sums)) sums[key] += fields[key][i];
      for (const key of Object.keys(maxima)) maxima[key] = Math.max(maxima[key], fields[key][i]);
      if (fields.organics[i] > 0.05 && fields.energyFlux[i] > 0.12) active++;
    }
    lastMetrics = Object.fromEntries(Object.entries(sums).map(([key, value]) => [key, value / size]));
    Object.assign(lastMetrics, {
      clock,
      activeChemistryCoverage: active / size,
      maxElementDrift: maxElementDrift(),
      maxComplexity: maxima.complexity,
      maxCompartmentPotential: maxima.compartmentPotential,
      maxSelfMaintenance: maxima.selfMaintenance,
      maxOrganics: maxima.organics,
      maxPrecursors: maxima.precursors,
      maxAmphiphiles: maxima.amphiphiles,
    });
  }

  function getMetrics() { return { ...lastMetrics }; }

  function hotspots(fieldName, limit = 8) {
    const values = fields[fieldName] ?? species[fieldName] ?? environment[fieldName];
    if (!values) return [];
    return Array.from(values, (value, index) => ({ index, value })).sort((a, b) => b.value - a.value).slice(0, limit);
  }

  return {
    step,
    getMetrics,
    getFields: () => fields,
    getSpecies: () => species,
    getEnvironment: () => environment,
    getReactionDefinitions: () => REACTIONS,
    getSpeciesDefinitions: () => SPECIES,
    getGrid: () => ({ columns, rows, size }),
    withdraw,
    deposit,
    getExternalElementLedger: () => Object.fromEntries(elementNames.map((name, index) => [name, externalTotals[index]])),
    hotspots,
    snapshot: () => ({ clock, metrics: getMetrics() })
  };
}

function elementalBalance(side) {
  const totals = {};
  for (const [name, coefficient] of Object.entries(side)) {
    const definition = SPECIES[name];
    if (!definition) throw new Error(`Unknown species ${name}`);
    for (const [element, count] of Object.entries(definition.formula)) totals[element] = (totals[element] ?? 0) + count * coefficient;
  }
  return totals;
}

function verifyReactionStoichiometry() {
  for (const reaction of REACTIONS) {
    const left = elementalBalance(reaction.reactants), right = elementalBalance(reaction.products);
    const elements = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const element of elements) {
      if (Math.abs((left[element] ?? 0) - (right[element] ?? 0)) > 1e-9) throw new Error(`Unbalanced reaction ${reaction.id}: ${element}`);
    }
  }
}
