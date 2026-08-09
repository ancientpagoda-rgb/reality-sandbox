import { samplePlanet } from './planet.js';

const STEP_SECONDS = 1.8;
const CELL_SIZE = 60;
const DIFFUSION = 0.035;
const TOXIN_DIFFUSION = 0.012;
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

async function waitForRuntime() {
  while (true) {
    const origin = window.realitySandboxOriginMotileLifeV47;
    const morphogenesis = window.realitySandboxMorphogenesisV48;
    const planet = window.realitySandboxPlanet;
    const modules = window.realitySandboxModules;
    const components = planet?.world?.ecs?.components;
    if (origin?.installed && morphogenesis?.installed && components?.detritus instanceof Map && components?.motile instanceof Map && modules?.step) {
      return { origin, planet, modules };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ origin, planet, modules }) {
  if (window.realitySandboxClosedNutrientCycleV49?.installed) return;

  const { world } = planet;
  const { resource, detritus, motile, position } = world.ecs.components;
  const cols = Math.max(1, Math.ceil(world.width / CELL_SIZE));
  const rows = Math.max(1, Math.ceil(world.height / CELL_SIZE));
  const cellCount = cols * rows;
  const nutrients = new Float32Array(cellCount);
  const soilToxin = new Float32Array(cellCount);
  const nextNutrients = new Float32Array(cellCount);
  const nextToxin = new Float32Array(cellCount);
  const weathering = new Float32Array(cellCount);
  const rainfall = new Float32Array(cellCount);
  const detritusMemory = new Map();
  let accumulator = 0;
  let steps = 0;

  const stats = {
    steps: 0,
    detritusRecycled: 0,
    naturalDecayDeposits: 0,
    disappearanceDeposits: 0,
    metabolicWasteDeposits: 0,
    plantUptake: 0,
    plantGrowthBonus: 0,
    weatheringInputs: 0,
    leachingLosses: 0,
    toxinDeposits: 0,
    toxinStressEvents: 0,
    diffusionPasses: 0,
    meanNutrient: 0,
    minNutrient: 0,
    maxNutrient: 0,
    meanSoilToxin: 0,
  };

  function indexFor(x, y) {
    const cx = Math.floor(wrap(x, world.width) / CELL_SIZE) % cols;
    const cy = Math.max(0, Math.min(rows - 1, Math.floor(Math.max(0, Math.min(world.height - 0.0001, y)) / CELL_SIZE)));
    return cy * cols + cx;
  }

  function initializeGrid() {
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const i = cy * cols + cx;
        const x = (cx + 0.5) * CELL_SIZE;
        const y = (cy + 0.5) * CELL_SIZE;
        const terrain = samplePlanet(x, y, world.width, world.height) || {};
        const rain = clamp(Number(terrain.rainfall) || 0);
        const elevation = clamp(Number(terrain.elevation) || 0);
        const land = Boolean(terrain.land);
        const variation = hash01(`${world.seed || 'nysa'}:nutrient:${cx}:${cy}`);
        rainfall[i] = rain;
        nutrients[i] = land ? clamp(0.34 + rain * 0.24 + variation * 0.18, 0.12, 0.82) : clamp(0.18 + variation * 0.12, 0.06, 0.38);
        weathering[i] = land ? 0.000035 + elevation * 0.000025 + rain * 0.000018 : 0.000012;
      }
    }
  }

  initializeGrid();

  function depositAt(x, y, nutrientAmount, toxinAmount = 0) {
    const i = indexFor(x, y);
    const nutrient = Math.max(0, Number(nutrientAmount) || 0);
    const toxin = Math.max(0, Number(toxinAmount) || 0);
    nutrients[i] = clamp(nutrients[i] + nutrient, 0, 2.5);
    soilToxin[i] = clamp(soilToxin[i] + toxin, 0, 2.0);
  }

  function recycleDetritus(dt) {
    const seen = new Set();
    for (const [id, det] of detritus.entries()) {
      const p = position.get(id);
      if (!p) continue;
      seen.add(id);
      const amount = Math.max(0, Number(det.amount) || 0);
      const toxin = clamp(det.toxin);
      const previous = detritusMemory.get(id);
      if (previous) {
        const observedLoss = Math.max(0, previous.amount - amount);
        const expectedNaturalDecay = dt * (0.006 + (Number(det.age) || 0) * 0.00002);
        // Only the portion compatible with passive decomposition is mineralized.
        // Large instantaneous losses are likely scavenging and stay in the food web.
        const decomposed = Math.min(observedLoss, expectedNaturalDecay * 1.35);
        if (decomposed > 0) {
          const recycled = decomposed * (0.78 - toxin * 0.12);
          const toxinDeposit = decomposed * toxin * 0.16;
          depositAt(p.x, p.y, recycled, toxinDeposit);
          stats.detritusRecycled += recycled;
          stats.naturalDecayDeposits++;
          stats.toxinDeposits += toxinDeposit;
        }
      }
      detritusMemory.set(id, { amount, x: p.x, y: p.y, toxin });
    }

    for (const [id, previous] of [...detritusMemory.entries()]) {
      if (seen.has(id)) continue;
      // A disappearing detritus entity may have been scavenged, so only a small
      // residual fraction is returned to soil instead of treating it all as decay.
      const residual = previous.amount * 0.10;
      if (residual > 0) {
        depositAt(previous.x, previous.y, residual * 0.72, residual * previous.toxin * 0.08);
        stats.detritusRecycled += residual * 0.72;
        stats.disappearanceDeposits++;
      }
      detritusMemory.delete(id);
    }
  }

  function depositMetabolicWaste(dt) {
    for (const [id, organism] of motile.entries()) {
      const p = position.get(id);
      if (!p) continue;
      const genome = organism.genome || {};
      const heterotrophy = clamp(genome.heterotrophy);
      const metabolism = clamp(genome.metabolism);
      const bodySize = clamp(genome.bodySize);
      if (heterotrophy <= 0.08) continue;
      const waste = dt * (0.00018 + metabolism * 0.00032) * (0.45 + bodySize * 0.75) * heterotrophy;
      depositAt(p.x, p.y, waste, 0);
      stats.metabolicWasteDeposits += waste;
    }
  }

  function plantUptake(dt) {
    for (const [id, res] of resource.entries()) {
      if (res.kind !== 'plant' && res.kind !== 'pod') continue;
      const p = position.get(id);
      if (!p) continue;
      const i = indexFor(p.x, p.y);
      const genome = res.bioV47?.genome || {};
      const photosynthesis = clamp(genome.photosynthesis ?? 0.75);
      const seedInvestment = clamp(genome.seedInvestment ?? 0.45);
      const biomass = clamp(res.amount);
      const demand = dt * (0.00028 + photosynthesis * 0.00052 + seedInvestment * 0.00020) * (0.30 + biomass * 0.70);
      const uptake = Math.min(nutrients[i], demand);
      nutrients[i] -= uptake;
      stats.plantUptake += uptake;

      const toxinStress = clamp(soilToxin[i] * (0.35 + photosynthesis * 0.20), 0, 0.85);
      const growth = uptake * (0.42 + photosynthesis * 0.55) * (1 - toxinStress);
      if (growth > 0 && res.amount < 1) {
        const before = res.amount;
        res.amount = Math.min(1, res.amount + growth);
        stats.plantGrowthBonus += res.amount - before;
      }
      if (toxinStress > 0.08) stats.toxinStressEvents++;

      res.bioV49 = {
        localNutrient: clamp(nutrients[i] / 1.2),
        localSoilToxin: clamp(soilToxin[i]),
        uptake,
        toxinStress,
      };
    }
  }

  function weatherAndDiffuse(dt) {
    for (let i = 0; i < cellCount; i++) {
      const input = weathering[i] * dt;
      nutrients[i] = Math.min(2.5, nutrients[i] + input);
      stats.weatheringInputs += input;
      const leachRate = rainfall[i] * dt * 0.00045;
      const leached = nutrients[i] * leachRate;
      nutrients[i] = Math.max(0, nutrients[i] - leached);
      stats.leachingLosses += leached;
      soilToxin[i] *= Math.max(0, 1 - dt * (0.0018 + rainfall[i] * 0.0015));
    }

    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const i = cy * cols + cx;
        const left = cy * cols + ((cx - 1 + cols) % cols);
        const right = cy * cols + ((cx + 1) % cols);
        const up = Math.max(0, cy - 1) * cols + cx;
        const down = Math.min(rows - 1, cy + 1) * cols + cx;
        const neighborN = (nutrients[left] + nutrients[right] + nutrients[up] + nutrients[down]) * 0.25;
        const neighborT = (soilToxin[left] + soilToxin[right] + soilToxin[up] + soilToxin[down]) * 0.25;
        nextNutrients[i] = nutrients[i] + (neighborN - nutrients[i]) * DIFFUSION;
        nextToxin[i] = soilToxin[i] + (neighborT - soilToxin[i]) * TOXIN_DIFFUSION;
      }
    }
    nutrients.set(nextNutrients);
    soilToxin.set(nextToxin);
    stats.diffusionPasses++;
  }

  function recount() {
    let sumN = 0;
    let sumT = 0;
    let minN = Infinity;
    let maxN = -Infinity;
    for (let i = 0; i < cellCount; i++) {
      const n = nutrients[i];
      sumN += n;
      sumT += soilToxin[i];
      minN = Math.min(minN, n);
      maxN = Math.max(maxN, n);
    }
    stats.meanNutrient = cellCount ? sumN / cellCount : 0;
    stats.meanSoilToxin = cellCount ? sumT / cellCount : 0;
    stats.minNutrient = Number.isFinite(minN) ? minN : 0;
    stats.maxNutrient = Number.isFinite(maxN) ? maxN : 0;
    stats.steps = steps;
  }

  function stepCycle(dt) {
    recycleDetritus(dt);
    depositMetabolicWaste(dt);
    plantUptake(dt);
    weatherAndDiffuse(dt);
    steps++;
    recount();
  }

  const previousStep = modules.step.bind(modules);
  modules.step = function v49ClosedNutrientStep(dt) {
    const result = previousStep(dt);
    accumulator += Number(dt) || 0;
    if (accumulator >= STEP_SECONDS) {
      const elapsed = accumulator;
      accumulator = 0;
      stepCycle(elapsed);
    }
    return result;
  };

  const api = {
    installed: true,
    sample(x, y) {
      const i = indexFor(x, y);
      return { nutrient: nutrients[i], toxin: soilToxin[i] };
    },
    getStats: () => ({
      ...stats,
      installed: true,
      grid: { cols, rows, cells: cellCount, cellSize: CELL_SIZE },
      detritusToSoil: true,
      metabolicWasteToSoil: true,
      soilToPlantBiomass: true,
      toxinSoilFeedback: true,
      weatheringAndLeaching: true,
      localNutrientField: true,
      hardPopulationCap: false,
      hardDisplayCap: false,
      surfaceRendererEnabled: false,
      authoritativeFixedStep: true,
    }),
  };

  window.realitySandboxClosedNutrientCycleV49 = api;
  window.realitySandboxEvolutionBuild = 'evolution-v49-closed-nutrient-cycle';
  document.documentElement.dataset.evolutionBuild = 'evolution-v49-closed-nutrient-cycle';
  document.documentElement.dataset.closedNutrientCycleV49 = 'detritus-soil-plants-foodweb';
}

waitForRuntime().then(install);