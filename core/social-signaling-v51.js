const STEP_SECONDS = 0.9;
const CELL_SIZE = 108;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number(v) || 0));
const wrap = (v, max) => ((v % max) + max) % max;

async function waitForRuntime() {
  while (true) {
    const brain = window.realitySandboxSensoryBrainsV50;
    const origin = window.realitySandboxOriginMotileLifeV47;
    const planet = window.realitySandboxPlanet;
    const modules = window.realitySandboxModules;
    const c = planet?.world?.ecs?.components;
    if (brain?.installed && origin?.installed && modules?.step && c?.motile instanceof Map && c?.position instanceof Map && c?.velocity instanceof Map) {
      return { brain, origin, planet, modules };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ brain, origin, planet, modules }) {
  if (window.realitySandboxSocialSignalingV51?.installed) return;
  const { world } = planet;
  const { motile, position, velocity, resource, detritus } = world.ecs.components;
  const cols = Math.max(1, Math.ceil(world.width / CELL_SIZE));
  const rows = Math.max(1, Math.ceil(world.height / CELL_SIZE));
  let accumulator = 0;
  let stepCount = 0;

  const stats = {
    steps: 0,
    signalsEmitted: 0,
    signalsReceived: 0,
    alarmCalls: 0,
    foodCalls: 0,
    huntCalls: 0,
    alarmResponses: 0,
    foodResponses: 0,
    huntResponses: 0,
    coordinatedLineages: 0,
    meanSignalRadius: 0,
  };

  function keyFor(x, y) {
    const cx = Math.floor(wrap(x, world.width) / CELL_SIZE) % cols;
    const cy = Math.max(0, Math.min(rows - 1, Math.floor(Math.max(0, Math.min(world.height - 0.0001, y)) / CELL_SIZE)));
    return `${cx}:${cy}`;
  }

  function neighborKeys(x, y, rings) {
    const cx = Math.floor(wrap(x, world.width) / CELL_SIZE) % cols;
    const cy = Math.max(0, Math.min(rows - 1, Math.floor(Math.max(0, Math.min(world.height - 0.0001, y)) / CELL_SIZE)));
    const out = [];
    for (let oy = -rings; oy <= rings; oy++) {
      for (let ox = -rings; ox <= rings; ox++) {
        out.push(`${(cx + ox + cols) % cols}:${Math.max(0, Math.min(rows - 1, cy + oy))}`);
      }
    }
    return out;
  }

  function dxTo(targetX, originX) {
    let d = targetX - originX;
    if (d > world.width * 0.5) d -= world.width;
    else if (d < -world.width * 0.5) d += world.width;
    return d;
  }

  function distance(a, b) {
    return Math.hypot(dxTo(b.x, a.x), b.y - a.y);
  }

  function buildGrid() {
    const grid = new Map();
    for (const [id] of motile.entries()) {
      const p = position.get(id);
      if (!p) continue;
      const key = keyFor(p.x, p.y);
      let bucket = grid.get(key);
      if (!bucket) grid.set(key, bucket = []);
      bucket.push(id);
    }
    return grid;
  }

  function targetPosition(signal) {
    if (!signal.targetId) return null;
    return position.get(signal.targetId) || null;
  }

  function emitterSignal(id, organism) {
    const behavior = organism.bioV50;
    if (!behavior?.mode) return null;
    const g = organism.genome || {};
    const sociality = clamp(g.sociality);
    const brainSpeed = clamp(g.brainSpeed);
    const sense = clamp(g.sense);
    if (sociality < 0.32) return null;
    const strength = clamp(sociality * 0.62 + brainSpeed * 0.24 + sense * 0.14);
    const radius = 45 + sense * 150 + sociality * 80;
    if (behavior.mode === 'flee' && behavior.detectedDanger) {
      return { type:'alarm', emitterId:id, lineageId:organism.lineageId, targetId:behavior.detectedDanger, strength, radius };
    }
    if ((behavior.mode === 'graze' && behavior.targetPlant) || (behavior.mode === 'scavenge' && behavior.targetDetritus)) {
      return { type:'food', emitterId:id, lineageId:organism.lineageId, targetId:behavior.targetPlant || behavior.targetDetritus, strength:strength * 0.82, radius };
    }
    if (behavior.mode === 'hunt' && behavior.detectedPrey && clamp(g.aggression) > 0.35) {
      return { type:'hunt', emitterId:id, lineageId:organism.lineageId, targetId:behavior.detectedPrey, strength:strength * (0.76 + clamp(g.aggression) * 0.24), radius };
    }
    return null;
  }

  function steer(vel, p, target, speed, blend) {
    const dx = dxTo(target.x, p.x);
    const dy = target.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    vel.vx = vel.vx * blend + (dx / d) * speed * (1 - blend);
    vel.vy = vel.vy * blend + (dy / d) * speed * (1 - blend);
  }

  function steerAway(vel, p, target, speed, blend) {
    const dx = dxTo(target.x, p.x);
    const dy = target.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    vel.vx = vel.vx * blend - (dx / d) * speed * (1 - blend);
    vel.vy = vel.vy * blend - (dy / d) * speed * (1 - blend);
  }

  function socialStep() {
    const grid = buildGrid();
    const signals = [];
    let radiusSum = 0;
    for (const [id, organism] of motile.entries()) {
      const signal = emitterSignal(id, organism);
      if (!signal) continue;
      signals.push(signal);
      radiusSum += signal.radius;
      stats.signalsEmitted++;
      if (signal.type === 'alarm') stats.alarmCalls++;
      else if (signal.type === 'food') stats.foodCalls++;
      else if (signal.type === 'hunt') stats.huntCalls++;
    }

    const coordinated = new Set();
    for (const signal of signals) {
      const sourcePos = position.get(signal.emitterId);
      const targetPos = targetPosition(signal);
      if (!sourcePos || !targetPos) continue;
      const rings = Math.max(1, Math.min(3, Math.ceil(signal.radius / CELL_SIZE)));
      for (const key of neighborKeys(sourcePos.x, sourcePos.y, rings)) {
        for (const id of grid.get(key) || []) {
          if (id === signal.emitterId) continue;
          const receiver = motile.get(id);
          const p = position.get(id);
          const vel = velocity.get(id);
          if (!receiver || !p || !vel || receiver.lineageId !== signal.lineageId) continue;
          const d = distance(sourcePos, p);
          if (d > signal.radius) continue;
          const g = receiver.genome || {};
          const sociality = clamp(g.sociality);
          const brainSpeed = clamp(g.brainSpeed);
          const sense = clamp(g.sense);
          const receptivity = clamp(sociality * 0.55 + brainSpeed * 0.30 + sense * 0.15);
          if (receptivity * signal.strength < 0.26) continue;
          const speed = 6 + clamp(g.motility) * 32;
          if (signal.type === 'alarm') {
            steerAway(vel, p, targetPos, speed * 1.08, 0.69);
            stats.alarmResponses++;
          } else if (signal.type === 'food') {
            steer(vel, p, targetPos, speed * 0.82, 0.80);
            stats.foodResponses++;
          } else if (signal.type === 'hunt') {
            steer(vel, p, targetPos, speed * 1.02, 0.72);
            stats.huntResponses++;
          }
          receiver.bioV51 = {
            signalType: signal.type,
            emitterId: signal.emitterId,
            targetId: signal.targetId,
            strength: signal.strength,
            receptivity,
            receivedAtStep: stepCount,
          };
          stats.signalsReceived++;
          coordinated.add(receiver.lineageId);
        }
      }
    }
    stats.coordinatedLineages = coordinated.size;
    stats.meanSignalRadius = signals.length ? radiusSum / signals.length : 0;
    stepCount++;
    stats.steps = stepCount;
  }

  const previousStep = modules.step.bind(modules);
  modules.step = function v51SocialSignalStep(dt) {
    const result = previousStep(dt);
    accumulator += Number(dt) || 0;
    if (accumulator >= STEP_SECONDS) {
      accumulator = 0;
      socialStep();
    }
    return result;
  };

  const api = {
    installed: true,
    getStats: () => ({
      ...stats,
      installed:true,
      inheritedSignalPropensity:true,
      kinRestrictedSignals:true,
      alarmCommunication:true,
      foodCommunication:true,
      packHuntCommunication:true,
      spatialHashing:true,
      authoritativeFixedStep:true,
      noHardPopulationCap:true,
      surfaceRendererEnabled:false,
    }),
    getSignalsReceived() {
      return [...motile.entries()].filter(([, organism]) => organism.bioV51).map(([id, organism]) => ({ id, lineageId:organism.lineageId, ...organism.bioV51 }));
    },
  };

  window.realitySandboxSocialSignalingV51 = api;
  window.realitySandboxEvolutionBuild = 'evolution-v51-social-signaling';
  document.documentElement.dataset.evolutionBuild = 'evolution-v51-social-signaling';
  document.documentElement.dataset.socialSignalingV51 = 'alarm-food-pack-hunt';
}

waitForRuntime().then(install);
