const ACTIVE_INTERVAL_MS = 150;
const INTERACTING_INTERVAL_MS = 260;
const INTERACTION_HOLD_MS = 150;
const MAX_ACCUMULATED_DT = 0.12;

async function waitForRuntime() {
  for (let attempt = 0; attempt < 300; attempt++) {
    const planet = window.realitySandboxPlanet;
    const modules = window.realitySandboxModules;
    const mode = window.realitySandboxSurfaceMode;
    if (planet?.world && modules?.step && mode?.isActive) return { world: planet.world, modules, mode };
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  return null;
}

function install({ world, modules, mode }) {
  if (window.realitySandboxSurfaceSimulationBudget?.installed) return;

  let lastInteractionAt = -Infinity;
  let lastWorldStepAt = -Infinity;
  let accumulatedDt = 0;
  let stepToken = 0;
  let consumedModuleToken = 0;

  const stats = {
    requestedWorldSteps: 0,
    executedWorldSteps: 0,
    skippedWorldSteps: 0,
    executedModuleSteps: 0,
    skippedModuleSteps: 0,
    interactionDeferrals: 0,
    backgroundDeferrals: 0,
  };

  const surfaceActive = () => Boolean(mode.isActive?.() && document.documentElement.dataset.surfaceMode === 'active');
  const recentlyInteracting = now => now - lastInteractionAt <= INTERACTION_HOLD_MS;

  const markInteraction = event => {
    if (!surfaceActive()) return;
    if (event?.type === 'keydown') {
      const code = event.code || '';
      if (!['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ControlLeft', 'ControlRight', 'KeyC', 'ShiftLeft', 'ShiftRight'].includes(code)) return;
    }
    lastInteractionAt = performance.now();
  };

  document.addEventListener('mousemove', markInteraction, { passive: true });
  document.addEventListener('pointermove', markInteraction, { passive: true });
  window.addEventListener('keydown', markInteraction, { passive: true });

  // createSphericalStepper checks this before copying every entity into the
  // previous-Y map. Returning false skips the complete world tick cheaply.
  world.getSphericalStepDt = function getSphericalStepDt(dt) {
    stats.requestedWorldSteps++;
    if (!surfaceActive()) {
      accumulatedDt = 0;
      lastWorldStepAt = performance.now();
      stepToken++;
      stats.executedWorldSteps++;
      return dt;
    }

    const now = performance.now();
    accumulatedDt = Math.min(MAX_ACCUMULATED_DT, accumulatedDt + Math.max(0, Number(dt) || 0));
    const interacting = recentlyInteracting(now);
    const interval = interacting ? INTERACTING_INTERVAL_MS : ACTIVE_INTERVAL_MS;

    if (now - lastWorldStepAt < interval) {
      stats.skippedWorldSteps++;
      if (interacting) stats.interactionDeferrals++;
      else stats.backgroundDeferrals++;
      return false;
    }

    lastWorldStepAt = now;
    const effectiveDt = Math.max(dt, accumulatedDt || dt);
    accumulatedDt = 0;
    stepToken++;
    stats.executedWorldSteps++;
    return effectiveDt;
  };

  // app-seeded calls moduleHost.step immediately after stepSphere. Keep those
  // expensive ecology / hydrology / biosphere modules in lockstep with only
  // the world ticks that the budget actually allowed.
  const nativeModuleStep = modules.step.bind(modules);
  modules.step = function surfaceBudgetedModuleStep(dt) {
    if (!surfaceActive()) {
      consumedModuleToken = stepToken;
      stats.executedModuleSteps++;
      return nativeModuleStep(dt);
    }
    if (consumedModuleToken === stepToken) {
      stats.skippedModuleSteps++;
      return;
    }
    consumedModuleToken = stepToken;
    stats.executedModuleSteps++;
    return nativeModuleStep(dt);
  };

  const api = {
    installed: true,
    markInteraction: () => { lastInteractionAt = performance.now(); },
    getStats: () => ({
      ...stats,
      surfaceActive: surfaceActive(),
      interacting: recentlyInteracting(performance.now()),
      activeIntervalMs: ACTIVE_INTERVAL_MS,
      interactingIntervalMs: INTERACTING_INTERVAL_MS,
      interactionHoldMs: INTERACTION_HOLD_MS,
      worldStepExecutionRatio: stats.requestedWorldSteps
        ? stats.executedWorldSteps / stats.requestedWorldSteps
        : 1,
    }),
  };

  window.realitySandboxSurfaceSimulationBudget = api;
  document.documentElement.dataset.surfaceSimulationBudget = 'adaptive-v1';

  const previousDiagnostics = window.realitySandboxPresentationDiagnostics;
  window.realitySandboxPresentationDiagnostics = () => ({
    ...(typeof previousDiagnostics === 'function' ? previousDiagnostics() : {}),
    surfaceSimulationBudget: api.getStats(),
  });
}

async function boot() {
  const state = await waitForRuntime();
  if (!state) {
    document.documentElement.dataset.surfaceSimulationBudget = 'unavailable';
    return;
  }
  install(state);
}

boot();
