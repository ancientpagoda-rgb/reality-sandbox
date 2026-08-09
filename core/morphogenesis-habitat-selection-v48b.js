import { samplePlanet } from './planet.js';
import { sampleHydrology } from './hydrology.js';

const STEP_SECONDS = 3.6;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number(v) || 0));

function waterAccessAt(x, y, world) {
  const h = sampleHydrology(x, y, world.width, world.height) || {};
  return clamp(
    (Number(h.river) || 0) * 0.42 +
    (Number(h.lake) || 0) * 0.52 +
    (Number(h.delta) || 0) * 0.58 +
    (Number(h.flood) || 0) * 0.12
  );
}

async function waitForRuntime() {
  while (true) {
    const morphogenesis = window.realitySandboxMorphogenesisV48;
    const cache = window.realitySandboxMorphogenesisInheritanceCacheV48a;
    const planet = window.realitySandboxPlanet;
    const modules = window.realitySandboxModules;
    if (morphogenesis?.installed && cache?.installed && planet?.world?.ecs?.components?.motile instanceof Map && modules?.step) {
      return { morphogenesis, planet, modules };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ planet, modules }) {
  if (window.realitySandboxMorphogenesisSelectionV48b?.installed) return;

  const { world } = planet;
  const { motile, position, velocity } = world.ecs.components;
  let accumulator = 0;
  let selectionSteps = 0;
  let organismsEvaluated = 0;
  let mismatchEvents = 0;
  let favorableEvents = 0;
  let aquaticSelections = 0;
  let terrestrialSelections = 0;
  let meanHabitatFitness = 0;

  function evaluate(dt) {
    let fitnessSum = 0;
    let count = 0;

    for (const [id, organism] of motile.entries()) {
      const p = position.get(id);
      const v48 = organism.bioV48;
      if (!p || !v48?.genes || !v48?.phenotype) continue;

      const genes = v48.genes;
      const phenotype = v48.phenotype;
      const terrain = samplePlanet(p.x, p.y, world.width, world.height) || {};
      const water = waterAccessAt(p.x, p.y, world);
      const land = Boolean(terrain.land);
      const dryness = clamp(1 - (Number(terrain.rainfall) || 0.5));

      const aquaticSupport = clamp(
        genes.aquaticAffinity * (0.24 + water * 0.76) +
        genes.contractility * 0.08 +
        (organism.genome?.motility || 0) * 0.06
      );
      const terrestrialSupport = clamp(
        genes.terrestrialAffinity * (0.28 + (1 - water) * 0.72) +
        genes.tissueRigidity * (0.08 + dryness * 0.16) +
        genes.contractility * 0.12 +
        genes.appendagePropensity * 0.10
      );

      const preferredAquatic = aquaticSupport >= terrestrialSupport;
      const habitatFit = clamp(
        Math.max(aquaticSupport, terrestrialSupport) * 0.78 +
        genes.multicellularity * 0.05 +
        genes.digestion * 0.04 +
        genes.neuralComplexity * 0.05 +
        (land === !preferredAquatic ? 0.08 : 0)
      );

      v48.habitatFitness = habitatFit;
      v48.aquaticSupport = aquaticSupport;
      v48.terrestrialSupport = terrestrialSupport;
      v48.selectionEnvironment = {
        land,
        waterAccess: water,
        rainfall: clamp(Number(terrain.rainfall) || 0),
        temperature: clamp(Number(terrain.temperature) || 0),
      };

      // Habitat match affects the same energy budget that controls v47 reproduction.
      // The effect is intentionally modest so v48 shapes selection rather than
      // replacing the established food/energy ecology.
      if (habitatFit < 0.34) {
        organism.energy = Math.max(0, (organism.energy || 0) - (0.34 - habitatFit) * dt * 0.018);
        mismatchEvents++;
      } else if (habitatFit > 0.58) {
        organism.energy = Math.min(2.7, (organism.energy || 0) + (habitatFit - 0.58) * dt * 0.010);
        favorableEvents++;
      }

      const vel = velocity.get(id);
      if (vel) {
        const mismatchSlow = 0.90 + habitatFit * 0.10;
        vel.vx *= mismatchSlow;
        vel.vy *= mismatchSlow;
      }

      // Record which developmental route is currently being selected by habitat.
      if (preferredAquatic) aquaticSelections++;
      else terrestrialSelections++;

      // Keep phenotype locomotion aligned with the selected developmental route.
      phenotype.locomotion = preferredAquatic ? 'aquatic' : 'terrestrial';
      phenotype.aquaticFit = aquaticSupport;
      phenotype.terrestrialFit = terrestrialSupport;

      fitnessSum += habitatFit;
      count++;
    }

    organismsEvaluated += count;
    meanHabitatFitness = count ? fitnessSum / count : 0;
    selectionSteps++;
  }

  const previousStep = modules.step.bind(modules);
  modules.step = function v48bHabitatSelectionStep(dt) {
    const result = previousStep(dt);
    accumulator += Number(dt) || 0;
    if (accumulator >= STEP_SECONDS) {
      const elapsed = accumulator;
      accumulator = 0;
      evaluate(elapsed);
    }
    return result;
  };

  const api = {
    installed: true,
    evaluate,
    getStats: () => ({
      installed: true,
      selectionSteps,
      organismsEvaluated,
      mismatchEvents,
      favorableEvents,
      aquaticSelections,
      terrestrialSelections,
      meanHabitatFitness,
      habitatAffectsEnergyBudget: true,
      habitatAffectsReproductionIndirectly: true,
      developmentalHabitatSelection: true,
      hardPopulationCap: false,
      surfaceRendererEnabled: false,
      authoritativeFixedStep: true,
    }),
  };

  window.realitySandboxMorphogenesisSelectionV48b = api;
  document.documentElement.dataset.morphogenesisSelectionV48b = 'aquatic-terrestrial-selection';
}

waitForRuntime().then(install);