// World state for M2: ECS-lite with Agent and Resource entities and physics integration.

import { createEcs } from './ecs.js';

export function createWorld(rng) {
  const width = 1200;
  const height = 720;

  const ecs = createEcs();

  const world = {
    tick: 0,
    width,
    height,
    ecs,
    regime: 'calm',
    globals: {
      fertility: 0.6,
      metabolism: 1.0,
      storminess: 0.0,
      reproductionThreshold: 1.6,
    },
  };

  // Spawn some initial agents and resources
  const AGENT_COUNT = 18;
  const RESOURCE_COUNT = 70;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function makeAgent(x, y, baseHue = 200, parentDna) {
    const id = ecs.createEntity();
    ecs.components.position.set(id, { x, y });

    const dna = parentDna
      ? {
          speed: clamp(parentDna.speed + (rng.float() - 0.5) * 0.1, 0.6, 1.4),
          sense: clamp(parentDna.sense + (rng.float() - 0.5) * 0.1, 0.6, 1.4),
          metabolism: clamp(parentDna.metabolism + (rng.float() - 0.5) * 0.1, 0.6, 1.6),
          hueShift: clamp(parentDna.hueShift + rng.int(-4, 4), -60, 60),
        }
      : {
          speed: 0.8 + rng.float() * 0.4,
          sense: 0.8 + rng.float() * 0.4,
          metabolism: 0.8 + rng.float() * 0.4,
          hueShift: rng.int(-40, 40),
        };

    const speed = 40 * dna.speed;

    ecs.components.velocity.set(id, {
      vx: (rng.float() - 0.5) * speed,
      vy: (rng.float() - 0.5) * speed,
    });
    const evolvedScore = dna.speed + dna.sense + (2 - dna.metabolism);
    const evolved = evolvedScore > 3.5; // simple heuristic for "advanced" forms

    ecs.components.agent.set(id, {
      colorHue: baseHue + dna.hueShift,
      energy: 1.0,
      dna,
      evolved,
    });
    return id;
  }

  function makeResource(x, y) {
    const id = ecs.createEntity();
    ecs.components.position.set(id, { x, y });
    ecs.components.resource.set(id, {
      amount: 1,
      regenTimer: rng.float() * 5,
    });
    return id;
  }

  for (let i = 0; i < AGENT_COUNT; i++) {
    makeAgent(rng.float() * width, rng.float() * height);
  }

  for (let i = 0; i < RESOURCE_COUNT; i++) {
    makeResource(rng.float() * width, rng.float() * height);
  }

  function physicsSystem(dt) {
    const { position, velocity } = ecs.components;
    const w = world.width;
    const h = world.height;

    for (const [id, vel] of velocity.entries()) {
      const pos = position.get(id);
      if (!pos) continue;
      pos.x += vel.vx * dt;
      pos.y += vel.vy * dt;

      // Wrap bounds
      if (pos.x < 0) pos.x += w;
      if (pos.x >= w) pos.x -= w;
      if (pos.y < 0) pos.y += h;
      if (pos.y >= h) pos.y -= h;
    }
  }

  // Steering: agents seek nearest resource and gently adjust velocity.
  function steeringSystem(dt) {
    const { position, velocity, agent, resource } = ecs.components;
    const avoidRadius = 18;

    // Build resource positions list once per tick
    const resourceList = [];
    for (const [id, res] of resource.entries()) {
      if (res.amount <= 0) continue;
      const pos = position.get(id);
      if (!pos) continue;
      resourceList.push({ id, pos });
    }

    for (const [id, ag] of agent.entries()) {
      const pos = position.get(id);
      const vel = velocity.get(id);
      if (!pos || !vel) continue;

      const dna = ag.dna || { speed: 1, sense: 1, metabolism: 1, hueShift: 0 };
      const seekRadius = 140 * dna.sense;

      let target = null;
      let targetDist2 = Infinity;

      for (const r of resourceList) {
        const dx = r.pos.x - pos.x;
        const dy = r.pos.y - pos.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < targetDist2 && d2 < seekRadius * seekRadius) {
          targetDist2 = d2;
          target = r.pos;
        }
      }

      // Seek resource
      if (target) {
        const dx = target.x - pos.x;
        const dy = target.y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const desiredSpeed = 40 * dna.speed;
        const desiredVx = (dx / dist) * desiredSpeed;
        const desiredVy = (dy / dist) * desiredSpeed;
        // Blend current velocity toward desired
        const blend = 0.8;
        vel.vx = vel.vx * blend + desiredVx * (1 - blend);
        vel.vy = vel.vy * blend + desiredVy * (1 - blend);
      }

      // Simple separation: avoid crowding other agents
      let ax = 0;
      let ay = 0;
      for (const [id2] of agent.entries()) {
        if (id2 === id) continue;
        const p2 = position.get(id2);
        if (!p2) continue;
        const dx = pos.x - p2.x;
        const dy = pos.y - p2.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0 && d2 < avoidRadius * avoidRadius) {
          const dist = Math.sqrt(d2) || 1;
          const strength = (avoidRadius - dist) / avoidRadius;
          ax += (dx / dist) * strength * 30;
          ay += (dy / dist) * strength * 30;
        }
      }
      vel.vx += ax * dt;
      vel.vy += ay * dt;
    }

  }

  // Metabolism & eating: agents lose energy over time, gain by consuming resources.
  function metabolismSystem(dt) {
    const { position, agent, resource } = ecs.components;
    const eatRadius = 10;
    const baseDrain = 0.03 * world.globals.metabolism; // per second, modulated by regime

    for (const [id, ag] of agent.entries()) {
      const dna = ag.dna || { speed: 1, sense: 1, metabolism: 1, hueShift: 0 };
      ag.energy -= baseDrain * dna.metabolism * dt;
      if (ag.energy < 0) ag.energy = 0;

      const pos = position.get(id);
      if (!pos) continue;

      for (const [rid, res] of resource.entries()) {
        if (res.amount <= 0) continue;
        const rpos = position.get(rid);
        if (!rpos) continue;
        const dx = rpos.x - pos.x;
        const dy = rpos.y - pos.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < eatRadius * eatRadius) {
          const bite = Math.min(0.6, res.amount);
          res.amount -= bite;
          ag.energy = Math.min(2.0, ag.energy + bite); // allow some over-fullness
        }
      }
    }
  }

  // Ecology: resources regrow over time when depleted.
  function ecologySystem(dt) {
    const { resource } = ecs.components;
    const fertility = world.globals.fertility;
    for (const res of resource.values()) {
      if (res.amount > 0.99) continue;
      res.regenTimer -= dt * (0.8 + fertility * 1.2);
      if (res.regenTimer <= 0) {
        res.amount = 1;
        res.regenTimer = 6 + Math.random() * 4; // slightly faster, staggered regrowth
      }
    }
  }

  // Reproduction & death.
  function lifeCycleSystem(dt) {
    const { position, velocity, agent } = ecs.components;

    // Herbivore lifecycle
    for (const [id, ag] of Array.from(agent.entries())) {
      // Clamp energy at zero but do not kill agents
      if (ag.energy <= 0) {
        ag.energy = 0;
      }

      // Reproduction
      if (ag.energy >= world.globals.reproductionThreshold) {
        const parentPos = position.get(id);
        const parentVel = velocity.get(id);
        if (!parentPos || !parentVel) continue;

        const jitter = () => (rng.float() - 0.5) * 8;
        const childId = makeAgent(
          parentPos.x + jitter(),
          parentPos.y + jitter(),
          ag.colorHue,
          ag.dna,
        );
        const childVel = velocity.get(childId);
        childVel.vx = parentVel.vx + jitter();
        childVel.vy = parentVel.vy + jitter();
        const childAgent = agent.get(childId);
        childAgent.energy = ag.energy * 0.5;

        ag.energy *= 0.5;
      }
    }

    // Cap population to avoid explosions
    const maxAgents = 120;
    if (agent.size > maxAgents) {
      const toCull = agent.size - maxAgents;
      let i = 0;
      for (const id of Array.from(agent.keys())) {
        if (i++ >= toCull) break;
        ecs.destroyEntity(id);
      }
    }
  }

  // Apply force fields (attractors/repulsors painted by user).
  function forceFieldSystem(dt) {
    const { position, velocity, forceField } = ecs.components;
    if (forceField.size === 0) return;
    for (const [fid, field] of forceField.entries()) {
      const fpos = position.get(fid);
      if (!fpos) continue;
      const radius2 = field.radius * field.radius;
      for (const [id, vel] of velocity.entries()) {
        const pos = position.get(id);
        if (!pos || pos === fpos) continue;
        const dx = fpos.x - pos.x;
        const dy = fpos.y - pos.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > radius2 || d2 === 0) continue;
        const dist = Math.sqrt(d2) || 1;
        const dir = field.strength >= 0 ? 1 : -1;
        const strength = (1 - dist / field.radius) * Math.abs(field.strength);
        const ax = (dx / dist) * dir * strength;
        const ay = (dy / dist) * dir * strength;
        vel.vx += ax * dt;
        vel.vy += ay * dt;
      }
    }
  }

  // Regime system: calm vs storm based on population & resource scarcity.
  function regimeSystem(dt) {
    const { agent, resource } = ecs.components;
    const pop = agent.size;
    let totalRes = 0;
    for (const r of resource.values()) totalRes += r.amount;
    const avgRes = resource.size ? totalRes / resource.size : 0;

    // Simple heuristic: low resources + high population increases storminess.
    const scarcity = avgRes < 0.5 ? (0.5 - avgRes) * 2 : 0;
    const pressure = pop / 80;
    const targetStorm = Math.max(0, Math.min(1, scarcity * 0.7 + pressure * 0.3));

    // Smooth toward target.
    world.globals.storminess += (targetStorm - world.globals.storminess) * 0.05;

    // Map storminess to metabolism and regime label.
    const s = world.globals.storminess;
    world.globals.metabolism = 1 + s * 1.5; // faster drain in storm
    world.regime = s > 0.55 ? 'storm' : 'calm';
  }

  function step(dt) {
    world.tick++;
    steeringSystem(dt);
    forceFieldSystem(dt);
    physicsSystem(dt);
    metabolismSystem(dt);
    ecologySystem(dt);
    lifeCycleSystem(dt);
    regimeSystem(dt);
  }

  // Paint/update force fields at a point with a given polarity.
  world.paintForceField = (point, polarity) => {
    const { position, forceField } = ecs.components;
    const radius = 80;
    const strength = polarity * 50; // positive = attract, negative = repel

    // Try to reuse a nearby field instead of spamming new ones
    let targetId = null;
    for (const [id, field] of forceField.entries()) {
      const pos = position.get(id);
      if (!pos) continue;
      const dx = pos.x - point.x;
      const dy = pos.y - point.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < (radius * 0.6) * (radius * 0.6)) {
        targetId = id;
        break;
      }
    }

    if (targetId == null) {
      targetId = ecs.createEntity();
      position.set(targetId, { x: point.x, y: point.y });
    } else {
      const pos = position.get(targetId);
      pos.x = point.x;
      pos.y = point.y;
    }

    forceField.set(targetId, { strength, radius });
  };

  world.step = step;
  return world;
}
