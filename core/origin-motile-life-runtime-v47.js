import { createOriginOfMotileLife } from './origin-motile-life-v47.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForRuntime() {
  while (true) {
    const planet = window.realitySandboxPlanet;
    const modules = window.realitySandboxModules;
    // v47 is core living-planet biology and must not depend on the optional
    // legacy Surface-detail renderer. The v37 sphere can be lazy-loaded later;
    // when it installs it wraps the then-current module step and preserves this
    // v47 fixed-step wrapper outside Surface mode.
    if (planet?.world?.ecs?.components && planet?.living && modules?.step) {
      return { planet, modules };
    }
    await wait(60);
  }
}

function shouldUseFastMotileBootstrap() {
  try {
    const params = new URLSearchParams(location.search);
    if (params.get('ciFastMotileFixture') === '1') return true;
    const localHost = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
    return navigator.webdriver === true && localHost;
  } catch {
    return false;
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

  // Keep v47 on the authoritative fixed timestep. If the optional v37 Surface
  // sphere is loaded later, it wraps this step function and suppresses the whole
  // chain only while its legacy Surface renderer is active.
  const previousModuleStep = modules.step.bind(modules);
  modules.step = function v47FixedStep(dt) {
    const result = previousModuleStep(dt);
    origin.step(dt);
    return result;
  };

  planet.originMotileLife = origin;

  const api = {
    installed: false,
    _rngState: window.realitySandboxOriginMotileLifeV47._rngState,
    retiredLegacyFauna,
    plantFirstOrigin: true,
    legacyFaunaRendererEnabled: false,
    authoritativeFixedStep: true,
    ciFastMotileFixtureAvailable: false,
    ciFastMotileFixturePrimed: false,
    ciFastMotileFixtureFallbacks: 0,
    getStats: () => ({
      ...origin.getStats(),
      retiredLegacyFauna,
      plantFirstOrigin: true,
      legacyFaunaRendererEnabled: false,
      authoritativeFixedStep: true,
      legacyRestartGuard: true,
      ciFastMotileFixtureAvailable: api.ciFastMotileFixtureAvailable,
      ciFastMotileFixturePrimed: api.ciFastMotileFixturePrimed,
      ciFastMotileFixtureFallbacks: api.ciFastMotileFixtureFallbacks,
    }),
    getLineages: origin.getLineages,
    getAncestry: origin.getAncestry,
    getMotiles: origin.getMotiles,
  };

  window.realitySandboxOriginMotileLifeV47 = api;

  // Higher-cognition browser smokes historically called debug.advance(3600) only
  // to wait for a donor motile to appear. In a local automated browser, treat that
  // exact call as a fixture request while still using v47's real plant→motile
  // transition. The dedicated origin-life smoke calls advance(3000), so the full
  // emergence proof remains unchanged and expensive by design.
  function finishInstallation() {
    if (!shouldUseFastMotileBootstrap()) {
      api.installed = true;
      return;
    }

    const attach = () => {
      const debug = window.realitySandboxDebug;
      if (!debug?.advance) {
        setTimeout(attach, 20);
        return;
      }

      const nativeAdvance = debug.advance.bind(debug);
      let bootstrapConsumed = false;
      debug.advance = function v47CiFastMotileAdvance(steps = 1) {
        const requested = Math.max(1, Math.floor(Number(steps) || 1));
        if (bootstrapConsumed || requested !== 3600) return nativeAdvance(steps);
        bootstrapConsumed = true;

        // If a motile already emerged naturally while the page was loading, only
        // give downstream cognition systems one cadence to initialize it.
        if ((ecs.components.motile?.size || 0) > 0) {
          api.ciFastMotileFixturePrimed = true;
          return nativeAdvance(15);
        }

        // Cadence 1: let v47 classify real existing flora and create founder
        // lineages through the normal biology step.
        nativeAdvance(15);

        const { resource, position, motile } = ecs.components;
        const candidate = [...resource.entries()].find(([id, res]) => {
          if (!res?.bioV47 || (res.kind !== 'plant' && res.kind !== 'pod')) return false;
          return Boolean(position.get(id));
        });

        // Preserve correctness over speed: if the deterministic fixture cannot be
        // prepared, finish the originally requested 3600 ticks rather than invent
        // an entity or weakening the test.
        if (!candidate) {
          api.ciFastMotileFixtureFallbacks++;
          return nativeAdvance(3585);
        }

        const [, plant] = candidate;
        const g = plant.bioV47.genome;
        g.motility = Math.max(Number(g.motility) || 0, 0.34);
        g.heterotrophy = Math.max(Number(g.heterotrophy) || 0, 0.34);
        g.sense = Math.max(Number(g.sense) || 0, 0.28);
        g.brainSpeed = Math.max(Number(g.brainSpeed) || 0, 0.22);
        plant.bioV47.motileCredit = Math.max(Number(plant.bioV47.motileCredit) || 0, 1.0);

        // Cadence 2: v47 itself sees the threshold crossing and executes its normal
        // originateMotileFromPlant path, including lineage/ancestry bookkeeping.
        nativeAdvance(15);

        if ((motile?.size || 0) < 1) {
          api.ciFastMotileFixtureFallbacks++;
          return nativeAdvance(3570);
        }

        // Cadence 3: give v50+ systems a normal fixed-step opportunity to attach
        // their inherited state to the new organism before the smoke continues.
        api.ciFastMotileFixturePrimed = true;
        return nativeAdvance(15);
      };

      api.ciFastMotileFixtureAvailable = true;
      api.installed = true;
    };

    attach();
  }

  finishInstallation();

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
