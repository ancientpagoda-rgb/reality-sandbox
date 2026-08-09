import { createOriginOfMotileLife } from './origin-motile-life-v47.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForRuntime() {
  while (true) {
    const planet = window.realitySandboxPlanet;
    const modules = window.realitySandboxModules;
    const surface = window.realitySandboxSurfaceSphereV37;
    if (planet?.world?.ecs?.components && planet?.living && modules?.step && surface?.installed) {
      return { planet, modules };
    }
    await wait(60);
  }
}

function install({ planet, modules }) {
  if (window.realitySandboxOriginMotileLifeV47?.installed) return;

  const { world, living } = planet;
  const ecs = world.ecs;
  const { agent, predator, apex } = ecs.components;

  // v47's origin story starts with flora. Remove the old hand-seeded fauna from
  // the live ECS, but keep the legacy systems intact for compatibility until the
  // old world module is refactored. A temporary non-entity sentinel prevents its
  // "all creatures extinct -> reseed everything" fallback from firing.
  let retiredLegacyFauna = 0;
  for (const map of [agent, predator, apex]) {
    for (const id of [...map.keys()]) {
      if (ecs.entities.has(id)) ecs.destroyEntity(id);
      else map.delete(id);
      retiredLegacyFauna++;
    }
  }

  const nativeWorldStep = world.step.bind(world);
  const SENTINEL_ID = -470047;
  world.step = function v47PlantFirstWorldStep(dt) {
    const legacyLiving = agent.size + predator.size + apex.size;
    if (legacyLiving === 0) {
      agent.set(SENTINEL_ID, {
        energy: 0,
        age: 0,
        dna: { speed: 0, sense: 0, metabolism: 0, hueShift: 0 },
        v47CompatibilitySentinel: true,
      });
    }
    try {
      return nativeWorldStep(dt);
    } finally {
      agent.delete(SENTINEL_ID);
    }
  };

  const seededRandom = () => {
    // The world was already created with the deterministic project RNG. v47 uses
    // a separate deterministic sequence so it does not perturb older systems.
    const state = window.realitySandboxOriginMotileLifeV47?._rngState || { value: (window.realitySandboxSeed?.numericSeed || 734221) >>> 0 };
    state.value = (Math.imul(state.value ^ (state.value >>> 15), 2246822519) + 3266489917) >>> 0;
    window.realitySandboxOriginMotileLifeV47._rngState = state;
    return state.value / 4294967296;
  };

  // Bootstrap shell is installed first so seededRandom has a stable state holder.
  window.realitySandboxOriginMotileLifeV47 = { installed: false, _rngState: { value: (window.realitySandboxSeed?.numericSeed || 734221) >>> 0 } };
  const origin = createOriginOfMotileLife(world, living, seededRandom);

  // v37 already wrapped moduleHost.step before this module installs. Wrapping it
  // now keeps v47 on the authoritative fixed timestep and also lets origin-life
  // continue evolving while v37 suppresses older expensive world modules in Surface.
  const previousModuleStep = modules.step.bind(modules);
  modules.step = function v47FixedStep(dt) {
    const result = previousModuleStep(dt);
    origin.step(dt);
    return result;
  };

  planet.originMotileLife = origin;

  const api = {
    installed: true,
    _rngState: window.realitySandboxOriginMotileLifeV47._rngState,
    retiredLegacyFauna,
    plantFirstOrigin: true,
    legacyFaunaRendererEnabled: false,
    authoritativeFixedStep: true,
    getStats: () => ({
      ...origin.getStats(),
      retiredLegacyFauna,
      plantFirstOrigin: true,
      legacyFaunaRendererEnabled: false,
      authoritativeFixedStep: true,
      legacyRestartGuard: true,
    }),
    getLineages: origin.getLineages,
    getAncestry: origin.getAncestry,
    getMotiles: origin.getMotiles,
  };

  window.realitySandboxOriginMotileLifeV47 = api;
  document.documentElement.dataset.originMotileLifeV47 = 'plant-first-googrid-inspired';
  document.documentElement.dataset.surfaceFaunaPolicy = 'motile-life-evolves-no-surface-renderer-yet';

  const previousDiagnostics = window.realitySandboxPresentationDiagnostics;
  window.realitySandboxPresentationDiagnostics = () => ({
    ...(typeof previousDiagnostics === 'function' ? previousDiagnostics() : {}),
    originMotileLifeV47: api.getStats(),
  });

  window.dispatchEvent(new CustomEvent('biosphere-event', {
    detail: {
      title: 'Abiogenesis phase',
      description: 'Nysa now begins with flora; motile life must emerge through inherited photosynthesis/feeding/motility trade-offs.',
    },
  }));
}

waitForRuntime().then(install);
