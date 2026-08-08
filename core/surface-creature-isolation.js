async function waitForSurfaceRuntime() {
  for (let attempt = 0; attempt < 300; attempt++) {
    const planet = window.realitySandboxPlanet;
    const mode = window.realitySandboxSurfaceMode;
    const perf = window.realitySandboxSurfacePerformance;
    if (
      planet?.world?.ecs?.components &&
      planet?.living?.step &&
      planet?.biosphere?.step &&
      mode?.isActive &&
      perf?.installed
    ) {
      return { planet, mode, perf };
    }
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  return null;
}

function install({ planet, mode, perf }) {
  if (window.realitySandboxSurfaceCreatureIsolation?.installed) return;

  const { world, living, biosphere } = planet;
  const stats = {
    worldStepsSuppressed: 0,
    livingStepsSuppressed: 0,
    biosphereStepsSuppressed: 0,
    creatureQueriesSuppressed: 0,
    creatureIndexRebuildsSuppressed: 0,
  };

  const surfaceActive = () => Boolean(
    mode.isActive?.() &&
    document.documentElement.dataset.surfaceMode === 'active'
  );

  // Keep all creature state in memory so this diagnostic cannot destroy or
  // permanently save a creature-less world. Surface Mode simply stops
  // advancing creature-heavy systems while this build is active.
  world.surfaceCreatureIsolationActive = () => surfaceActive();
  world.noteSurfaceCreatureWorldStepSuppressed = () => {
    stats.worldStepsSuppressed++;
  };

  const nativeLivingStep = living.step.bind(living);
  living.step = function surfaceNoCreatureLivingStep(dt) {
    if (surfaceActive()) {
      stats.livingStepsSuppressed++;
      return;
    }
    return nativeLivingStep(dt);
  };

  const nativeBiosphereStep = biosphere.step.bind(biosphere);
  biosphere.step = function surfaceNoCreatureBiosphereStep(dt) {
    if (surfaceActive()) {
      stats.biosphereStepsSuppressed++;
      return;
    }
    return nativeBiosphereStep(dt);
  };

  if (typeof perf.queryNearbyCreatures === 'function') {
    const nativeQueryNearbyCreatures = perf.queryNearbyCreatures.bind(perf);
    perf.queryNearbyCreatures = function surfaceNoCreatureQuery(...args) {
      if (surfaceActive()) {
        stats.creatureQueriesSuppressed++;
        return [];
      }
      return nativeQueryNearbyCreatures(...args);
    };
  }

  if (typeof perf.rebuildCreatureIndex === 'function') {
    const nativeRebuildCreatureIndex = perf.rebuildCreatureIndex.bind(perf);
    perf.rebuildCreatureIndex = function surfaceNoCreatureIndexRebuild(...args) {
      if (surfaceActive()) {
        stats.creatureIndexRebuildsSuppressed++;
        return;
      }
      return nativeRebuildCreatureIndex(...args);
    };
  }

  const counts = () => {
    const components = world.ecs.components;
    return {
      agentsStored: components.agent?.size || 0,
      predatorsStored: components.predator?.size || 0,
      apexStored: components.apex?.size || 0,
      creaturesPresented: surfaceActive() ? 0 :
        (components.agent?.size || 0) + (components.predator?.size || 0) + (components.apex?.size || 0),
    };
  };

  const api = {
    installed: true,
    isActive: surfaceActive,
    getStats: () => ({
      ...stats,
      ...counts(),
      surfaceActive: surfaceActive(),
      mode: 'temporary-no-creatures',
      destructive: false,
    }),
  };

  window.realitySandboxSurfaceCreatureIsolation = api;
  document.documentElement.dataset.surfaceCreatureIsolation = 'temporary-no-creatures';

  const previousDiagnostics = window.realitySandboxPresentationDiagnostics;
  window.realitySandboxPresentationDiagnostics = () => ({
    ...(typeof previousDiagnostics === 'function' ? previousDiagnostics() : {}),
    surfaceCreatureIsolation: api.getStats(),
  });
}

async function boot() {
  const state = await waitForSurfaceRuntime();
  if (!state) {
    document.documentElement.dataset.surfaceCreatureIsolation = 'unavailable';
    return;
  }
  install(state);
}

boot();
