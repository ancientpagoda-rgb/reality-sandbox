const CHECK_MS = 900;
const MAX_SPEED = {
  agent: 58,
  predator: 78,
  apex: 66,
};

async function waitForRuntime() {
  for (let i = 0; i < 420; i++) {
    const planet = window.realitySandboxPlanet;
    const migration = window.realitySandboxEcologicalMigrationV46;
    if (planet?.world?.ecs?.components && migration?.installed) return { planet, migration };
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  return null;
}

function install({ planet }) {
  if (window.realitySandboxMigrationVelocityGuardV46?.installed) return;
  const { velocity, agent, predator, apex } = planet.world.ecs.components;
  let checks = 0;
  let clamped = 0;

  function constrain() {
    checks++;
    for (const [role, map] of [['agent', agent], ['predator', predator], ['apex', apex]]) {
      const max = MAX_SPEED[role];
      for (const [id, organism] of map.entries()) {
        if (!organism.migrationActive) continue;
        const vel = velocity.get(id);
        if (!vel) continue;
        const speed = Math.hypot(vel.vx, vel.vy);
        if (!Number.isFinite(speed) || speed <= max) continue;
        const scale = max / Math.max(0.001, speed);
        vel.vx *= scale;
        vel.vy *= scale;
        clamped++;
      }
    }
    setTimeout(constrain, CHECK_MS);
  }

  const api = {
    installed: true,
    getStats: () => ({
      installed: true,
      boundedMigrationVelocity: true,
      maxAgentSpeed: MAX_SPEED.agent,
      maxPredatorSpeed: MAX_SPEED.predator,
      maxApexSpeed: MAX_SPEED.apex,
      checks,
      clamped,
      scheduledSimulationOnly: true,
      renderLoopProceduralSamples: 0,
    }),
  };

  window.realitySandboxMigrationVelocityGuardV46 = api;
  document.documentElement.dataset.ecologicalMigrationVelocityGuardV46 = 'bounded';
  const previous = window.realitySandboxPresentationDiagnostics;
  window.realitySandboxPresentationDiagnostics = () => ({
    ...(typeof previous === 'function' ? previous() : {}),
    ecologicalMigrationVelocityGuardV46: api.getStats(),
  });
  constrain();
}

waitForRuntime().then(state => {
  if (!state) {
    document.documentElement.dataset.ecologicalMigrationVelocityGuardV46 = 'unavailable';
    return;
  }
  install(state);
});
