const R_KJ = 0.008314462618;
const EPSILON = 1e-8;

const SPECIES = Object.freeze({
  water: { formula: { H: 2, O: 1 }, mobile: 0.12, organic: false },
  hydrogen: { formula: { H: 2 }, mobile: 0.22, organic: false },
  carbonDioxide: { formula: { C: 1, O: 2 }, mobile: 0.16, organic: false },
  carbonMonoxide: { formula: { C: 1, O: 1 }, mobile: 0.17, organic: false },
  nitrogen: { formula: { N: 2 }, mobile: 0.12, organic: false },
  ammonia: { formula: { N: 1, H: 3 }, mobile: 0.14, organic: false },
  hydrogenSulfide: { formula: { H: 2, S: 1 }, mobile: 0.13, organic: false },
  ferrousOxide: { formula: { Fe: 1, O: 1 }, mobile: 0.001, organic: false },
  magnetite: { formula: { Fe: 3, O: 4 }, mobile: 0.001, organic: false },
  phosphate: { formula: { H: 3, P: 1, O: 4 }, mobile: 0.045, organic: false },
  methane: { formula: { C: 1, H: 4 }, mobile: 0.18, organic: true },
  reducedCarbon: { formula: { C: 1, H: 2, O: 1 }, mobile: 0.09, organic: true },
  formamide: { formula: { C: 1, H: 3, N: 1, O: 1 }, mobile: 0.075, organic: true },
  amphiphile: { formula: { C: 8, H: 16, O: 2 }, mobile: 0.018, organic: true },
  condensate: { formula: { C: 2, H: 4, N: 2, O: 1 }, mobile: 0.025, organic: true },
});

const REACTIONS = Object.freeze([
  { id: 'water-rock-hydrogen-generation', reactants: { ferrousOxide: 3, water: 1 }, products: { magnetite: 1, hydrogen: 1 }, deltaG0: -42, activationEnergy: 68, prefactor: 2.4e9, mineralCatalysis: 18, hydrothermalCatalysis: 32 },
  { id: 'serpentinization-carbon-reduction', reactants: { carbonDioxide: 1, hydrogen: 4 }, products: { methane: 1, water: 2 }, deltaG0: -130, activationEnergy: 74, prefactor: 3e10, mineralCatalysis: 34, hydrothermalCatalysis: 18 },
  { id: 'energy-driven-carbon-fixation', reactants: { carbonDioxide: 1, hydrogen: 2 }, products: { reducedCarbon: 1, water: 1 }, deltaG0: 38, activationEnergy: 86, prefactor: 1.2e11, mineralCatalysis: 30, hydrothermalCatalysis: 22, energyCoupling: 72 },
  { id: 'abiotic-nitrogen-fixation', reactants: { nitrogen: 1, hydrogen: 3 }, products: { ammonia: 2 }, deltaG0: -33, activationEnergy: 118, prefactor: 2e12, mineralCatalysis: 42, ultravioletCatalysis: 25, energyCoupling: 20 },
  { id: 'carbon-nitrogen-coupling', reactants: { reducedCarbon: 1, ammonia: 1 }, products: { formamide: 1, hydrogen: 1 }, deltaG0: 24, activationEnergy: 82, prefactor: 1.8e11, mineralCatalysis: 24, wetDryCatalysis: 24, energyCoupling: 54 },
  { id: 'amphiphile-condensation', reactants: { reducedCarbon: 8, hydrogen: 6 }, products: { amphiphile: 1, water: 6 }, deltaG0: 96, activationEnergy: 82, prefactor: 8e11, mineralCatalysis: 38, wetDryCatalysis: 52, energyCoupling: 190 },
  { id: 'nitrogenous-condensation', reactants: { formamide: 2 }, products: { condensate: 1, water: 1 }, deltaG0: 31, activationEnergy: 91, prefactor: 6e11, mineralCatalysis: 20, wetDryCatalysis: 35, ultravioletCatalysis: 11, energyCoupling: 70 },
  { id: 'formamide-photolysis', reactants: { formamide: 1 }, products: { carbonMonoxide: 1, ammonia: 1 }, deltaG0: 18, activationEnergy: 76, prefactor: 7e10, ultravioletCatalysis: 48, energyCoupling: 58 },
  { id: 'condensate-hydrolysis', reactants: { condensate: 1, water: 1 }, products: { formamide: 2 }, deltaG0: -12, activationEnergy: 63, prefactor: 5e9, hydrothermalCatalysis: 10 },
  { id: 'amphiphile-hydrolysis', reactants: { amphiphile: 1, water: 6 }, products: { reducedCarbon: 8, hydrogen: 6 }, deltaG0: -8, activationEnergy: 104, prefactor: 4e9, hydrothermalCatalysis: 8, ultravioletCatalysis: 11 },
]);

verifyReactionStoichiometry();

export function createPhysicalChemicalKernel(options = {}) {
  const columns = Math.max(1, Math.floor(options.columns || 28));
  const rows = Math.max(1, Math.floor(options.rows || 14));
  const size = columns * rows;
  const environment = options.environment || {};
  const star = options.star || {};
  const disk = options.disk || {};
  const planet = options.planet || {};
  const rng = mulberry32(options.seed ?? 0xC0FFEE);
  const species = Object.fromEntries(Object.keys(SPECIES).map(name => [name, new Float64Array(size)]));
  const scratch = Object.fromEntries(Object.keys(SPECIES).map(name => [name, new Float64Array(size)]));
  const local = {
    temperatureK: new Float32Array(size), pressureBar: new Float32Array(size), energyFlux: new Float32Array(size), redoxDrive: new Float32Array(size),
    organics: new Float32Array(size), amphiphiles: new Float32Array(size), precursors: new Float32Array(size), complexity: new Float32Array(size),
    reactionEnergyUse: new Float32Array(size), reactionHeat: new Float32Array(size),
  };
  const elementNames = ['H', 'C', 'N', 'O', 'P', 'S', 'Fe', 'Ni'];
  const initialElementTotals = new Float64Array(elementNames.length);
  const exportedToBiology = new Float64Array(elementNames.length);
  let clock = 0;
  let metrics = emptyMetrics();

  seedFromAstrophysics();
  captureElementTotals(initialElementTotals);
  refreshDerivedFields();
  recalculateMetrics();

  function seedFromAstrophysics() {
    const metallicity = clamp(Number(star.metallicity) || 0, -2.5, 0.7);
    const metalScale = clamp(10 ** metallicity, 0.03, 4);
    const carbonToOxygen = clamp(Number(disk.carbonToOxygen) || 0.55, 0.15, 1.4);
    const atmosphere = clamp(Number(planet.atmosphereRetention) || 0.5, 0.02, 1);
    const waterFraction = clamp(Number(planet.waterFraction) || 0.25, 0, 1);
    const rocky = String(planet.composition || '').includes('rocky');
    const carbonScale = clamp(metalScale * (0.55 + carbonToOxygen * 0.9), 0.03, 3.5);
    const nitrogenScale = clamp(metalScale * 0.78, 0.02, 2.8);
    const phosphorusScale = clamp(metalScale * (rocky ? 1 : 0.35), 0.01, 2.2);
    const sulfurScale = clamp(metalScale * 0.95, 0.02, 3);
    for (let index = 0; index < size; index++) {
      const water = clamp(sampleEnvironment('water', index, waterFraction), 0, 1);
      const minerals = clamp(sampleEnvironment('minerals', index, rocky ? 0.6 : 0.25), 0, 1);
      const hydrothermal = clamp(sampleEnvironment('hydrothermal', index, 0.1), 0, 1);
      const wetDry = clamp(sampleEnvironment('wetDry', index, 0.08), 0, 1);
      const ultraviolet = clamp(sampleEnvironment('ultraviolet', index, 0.2), 0, 1.5);
      const normalizedTemperature = clamp(sampleEnvironment('temperature', index, 0.58), 0, 1);
      const baseTemperature = clamp(Number(planet.equilibriumTemperature) || 285, 120, 800);
      local.temperatureK[index] = clamp(baseTemperature + (normalizedTemperature - 0.58) * 125 + hydrothermal * 55, 165, 520);
      local.pressureBar[index] = clamp(0.03 + atmosphere ** 1.7 * (0.55 + (Number(planet.massEarth) || 1) ** 0.35), 0.02, 20);
      local.energyFlux[index] = clamp(hydrothermal * 0.58 + ultraviolet * 0.24 + wetDry * 0.28, 0, 1.8);
      local.redoxDrive[index] = clamp(hydrothermal * 0.68 + minerals * 0.25 - ultraviolet * 0.12, -0.2, 1.2);
      species.water[index] = 0.4 + water * 3.6;
      species.hydrogen[index] = 0.012 + hydrothermal * 0.46 + minerals * 0.035;
      species.carbonDioxide[index] = (0.055 + atmosphere * 0.24) * carbonScale * (0.7 + rng() * 0.12);
      species.carbonMonoxide[index] = hydrothermal * 0.004 * carbonScale;
      species.nitrogen[index] = (0.08 + atmosphere * 0.28) * nitrogenScale * (0.82 + rng() * 0.1);
      species.hydrogenSulfide[index] = (0.002 + hydrothermal * 0.055) * sulfurScale;
      species.ferrousOxide[index] = minerals * metalScale * (0.18 + hydrothermal * 0.12);
      species.magnetite[index] = minerals * metalScale * 0.015;
      species.phosphate[index] = (0.00018 + minerals * 0.0028 + wetDry * 0.0016) * phosphorusScale;
    }
  }

  function step(dt) {
    const simDt = clamp(Number(dt) || 0, 0, 1);
    if (simDt <= 0) return metrics;
    clock += simDt;
    diffuseSpecies(simDt);
    local.reactionEnergyUse.fill(0);
    local.reactionHeat.fill(0);
    for (let index = 0; index < size; index++) for (const reaction of REACTIONS) applyReaction(index, reaction, simDt);
    refreshDerivedFields();
    recalculateMetrics();
    return metrics;
  }

  function applyReaction(index, reaction, dt) {
    const temperature = local.temperatureK[index];
    const minerals = clamp(sampleEnvironment('minerals', index, 0.4), 0, 1);
    const hydrothermal = clamp(sampleEnvironment('hydrothermal', index, 0.1), 0, 1);
    const wetDry = clamp(sampleEnvironment('wetDry', index, 0.1), 0, 1);
    const ultraviolet = clamp(sampleEnvironment('ultraviolet', index, 0.1), 0, 1.5);
    const catalystReduction = minerals * (reaction.mineralCatalysis || 0) + hydrothermal * (reaction.hydrothermalCatalysis || 0) + wetDry * (reaction.wetDryCatalysis || 0) + ultraviolet * (reaction.ultravioletCatalysis || 0);
    const activationEnergy = Math.max(8, reaction.activationEnergy - catalystReduction);
    const arrhenius = reaction.prefactor * Math.exp(-activationEnergy / (R_KJ * temperature));
    const q = reactionQuotient(index, reaction);
    const deltaG = reaction.deltaG0 + R_KJ * temperature * Math.log(Math.max(EPSILON, q));
    const effectiveDeltaG = deltaG - local.energyFlux[index] * (reaction.energyCoupling || 0);
    const thermodynamicDrive = effectiveDeltaG < 0 ? clamp(1 - Math.exp(effectiveDeltaG / Math.max(EPSILON, R_KJ * temperature)), 0, 1) : 0;
    if (thermodynamicDrive <= 0) return;
    let availability = 1;
    let limitingExtent = Infinity;
    for (const [name, coefficient] of Object.entries(reaction.reactants)) {
      const amount = Math.max(0, species[name][index]);
      availability *= amount / (1 + amount);
      limitingExtent = Math.min(limitingExtent, amount / coefficient);
    }
    if (!Number.isFinite(limitingExtent) || limitingExtent <= EPSILON) return;
    const extent = Math.min(limitingExtent * 0.22, arrhenius * availability * thermodynamicDrive * dt * 2.5e-6);
    if (extent <= EPSILON) return;
    local.reactionEnergyUse[index] += Math.max(0, deltaG) * extent;
    local.reactionHeat[index] += Math.max(0, -effectiveDeltaG) * extent;
    for (const [name, coefficient] of Object.entries(reaction.reactants)) species[name][index] = Math.max(0, species[name][index] - extent * coefficient);
    for (const [name, coefficient] of Object.entries(reaction.products)) species[name][index] += extent * coefficient;
  }

  function reactionQuotient(index, reaction) {
    let numerator = 1;
    let denominator = 1;
    for (const [name, coefficient] of Object.entries(reaction.products)) numerator *= Math.pow(activity(species[name][index]), coefficient);
    for (const [name, coefficient] of Object.entries(reaction.reactants)) denominator *= Math.pow(activity(species[name][index]), coefficient);
    return numerator / Math.max(EPSILON, denominator);
  }
  function activity(amount) { return Math.max(EPSILON, amount / (1 + amount)); }

  function diffuseSpecies(dt) {
    for (const [name, definition] of Object.entries(SPECIES)) {
      const coefficient = definition.mobile * dt;
      if (coefficient <= 0) continue;
      const source = species[name];
      const target = scratch[name];
      for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
        const index = row * columns + column;
        const north = Math.max(0, row - 1) * columns + column;
        const south = Math.min(rows - 1, row + 1) * columns + column;
        const west = row * columns + ((column - 1 + columns) % columns);
        const east = row * columns + ((column + 1) % columns);
        const average = (source[north] + source[south] + source[west] + source[east]) * 0.25;
        target[index] = Math.max(0, source[index] + (average - source[index]) * coefficient);
      }
      source.set(target);
    }
  }

  function refreshDerivedFields() { for (let index = 0; index < size; index++) refreshCell(index); }
  function refreshCell(index) {
    const reduced = species.reducedCarbon[index], formamide = species.formamide[index], amphiphile = species.amphiphile[index], condensate = species.condensate[index], phosphate = species.phosphate[index], methane = species.methane[index];
    local.organics[index] = saturate(reduced * 0.52 + formamide * 0.9 + amphiphile * 2.8 + condensate * 1.35 + methane * 0.08, 0.22);
    local.amphiphiles[index] = saturate(amphiphile, 0.008);
    local.precursors[index] = saturate(Math.min(formamide * 1.7 + condensate * 2.2, phosphate * 120) + reduced * 0.14, 0.055);
    local.complexity[index] = chemicalDiversity(index);
  }
  function chemicalDiversity(index) {
    const values = ['methane', 'reducedCarbon', 'formamide', 'amphiphile', 'condensate'].map(name => species[name][index]).filter(value => value > EPSILON);
    const total = values.reduce((sum, value) => sum + value, 0);
    if (total <= EPSILON) return 0;
    let entropy = 0;
    for (const value of values) { const p = value / total; entropy -= p * Math.log(p); }
    return clamp(entropy / Math.log(5), 0, 1);
  }

  function consumeOrganics(index, normalizedAmount) {
    const demand = Math.max(0, Number(normalizedAmount) || 0) * 0.035;
    if (demand <= 0 || index < 0 || index >= size) return 0;
    const pools = ['condensate', 'formamide', 'reducedCarbon'];
    const available = pools.reduce((sum, name) => sum + species[name][index], 0);
    if (available <= EPSILON) return 0;
    const consumed = Math.min(available, demand);
    for (const name of pools) {
      const share = species[name][index] / available;
      const amount = consumed * share;
      const formula = SPECIES[name].formula;
      for (let e = 0; e < elementNames.length; e++) exportedToBiology[e] += amount * (formula[elementNames[e]] || 0);
      species[name][index] = Math.max(0, species[name][index] - amount);
    }
    refreshCell(index);
    return consumed;
  }

  function recalculateMetrics() {
    let organics = 0, amphiphiles = 0, precursors = 0, complexity = 0, energyFlux = 0, reactionEnergyUse = 0, reactionHeat = 0, activeChemistry = 0;
    for (let index = 0; index < size; index++) {
      organics += local.organics[index]; amphiphiles += local.amphiphiles[index]; precursors += local.precursors[index]; complexity += local.complexity[index]; energyFlux += local.energyFlux[index]; reactionEnergyUse += local.reactionEnergyUse[index]; reactionHeat += local.reactionHeat[index];
      if (local.organics[index] > 0.02 && local.energyFlux[index] > 0.12) activeChemistry++;
    }
    metrics = { clock, organics: organics / size, amphiphiles: amphiphiles / size, precursors: precursors / size, complexity: complexity / size, energyFlux: energyFlux / size, reactionEnergyUse: reactionEnergyUse / size, reactionHeat: reactionHeat / size, activeChemistryCoverage: activeChemistry / size, maxElementDrift: calculateMaxElementDrift() };
  }
  function calculateMaxElementDrift() {
    let maximum = 0;
    const current = new Float64Array(elementNames.length);
    captureElementTotals(current);
    for (let i = 0; i < current.length; i++) {
      current[i] += exportedToBiology[i];
      const baseline = Math.max(EPSILON, initialElementTotals[i]);
      maximum = Math.max(maximum, Math.abs(current[i] - initialElementTotals[i]) / baseline);
    }
    return maximum;
  }
  function captureElementTotals(target) {
    target.fill(0);
    for (let index = 0; index < size; index++) for (const [name, definition] of Object.entries(SPECIES)) {
      const amount = species[name][index];
      for (let e = 0; e < elementNames.length; e++) target[e] += amount * (definition.formula[elementNames[e]] || 0);
    }
  }
  function sampleEnvironment(name, index, fallback) { const values = environment[name]; return !values || !Number.isFinite(values[index]) ? fallback : values[index]; }

  function reset({ deplete = false } = {}) {
    for (const name of Object.keys(species)) species[name].fill(0);
    exportedToBiology.fill(0);
    clock = 0;
    if (!deplete) { seedFromAstrophysics(); captureElementTotals(initialElementTotals); }
    refreshDerivedFields(); recalculateMetrics();
  }
  function save() {
    return { version: 1, columns, rows, clock, exportedToBiology: Array.from(exportedToBiology, value => Math.round(value * 1e6) / 1e6), species: Object.fromEntries(Object.keys(SPECIES).map(name => [name, Array.from(species[name], value => Math.round(value * 1e6) / 1e6)])) };
  }
  function load(state) {
    if (!state || state.columns !== columns || state.rows !== rows || !state.species) return false;
    for (const name of Object.keys(SPECIES)) {
      const values = state.species[name];
      if (!Array.isArray(values)) continue;
      for (let index = 0; index < Math.min(size, values.length); index++) species[name][index] = Math.max(0, Number(values[index]) || 0);
    }
    clock = Math.max(0, Number(state.clock) || 0);
    exportedToBiology.fill(0);
    if (Array.isArray(state.exportedToBiology)) for (let i = 0; i < Math.min(exportedToBiology.length, state.exportedToBiology.length); i++) exportedToBiology[i] = Math.max(0, Number(state.exportedToBiology[i]) || 0);
    captureElementTotals(initialElementTotals);
    for (let i = 0; i < initialElementTotals.length; i++) initialElementTotals[i] += exportedToBiology[i];
    refreshDerivedFields(); recalculateMetrics(); return true;
  }

  return { step, consumeOrganics, getFields: () => local, getSpecies: () => species, getMetrics: () => ({ ...metrics }), getSpeciesDefinitions: () => SPECIES, getReactionDefinitions: () => REACTIONS, getExportedElementLedger: () => Object.fromEntries(elementNames.map((name, index) => [name, exportedToBiology[index]])), reset, save, load };
}

function verifyReactionStoichiometry() {
  for (const reaction of REACTIONS) {
    const reactants = elementalBalance(reaction.reactants), products = elementalBalance(reaction.products);
    const elements = new Set([...Object.keys(reactants), ...Object.keys(products)]);
    for (const element of elements) if (Math.abs((reactants[element] || 0) - (products[element] || 0)) > 1e-9) throw new Error(`Unbalanced physical-chemical reaction ${reaction.id}: ${element}`);
  }
}
function elementalBalance(side) {
  const totals = {};
  for (const [name, coefficient] of Object.entries(side)) {
    const definition = SPECIES[name];
    if (!definition) throw new Error(`Unknown species in reaction network: ${name}`);
    for (const [element, count] of Object.entries(definition.formula)) totals[element] = (totals[element] || 0) + count * coefficient;
  }
  return totals;
}
function emptyMetrics() { return { clock: 0, organics: 0, amphiphiles: 0, precursors: 0, complexity: 0, energyFlux: 0, reactionEnergyUse: 0, reactionHeat: 0, activeChemistryCoverage: 0, maxElementDrift: 0 }; }
function saturate(value, scale) { return clamp(value / Math.max(EPSILON, value + scale), 0, 1); }
function mulberry32(seed) { let value = seed >>> 0; return () => { value += 0x6D2B79F5; let result = value; result = Math.imul(result ^ result >>> 15, result | 1); result ^= result + Math.imul(result ^ result >>> 7, result | 61); return ((result ^ result >>> 14) >>> 0) / 4294967296; }; }
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
