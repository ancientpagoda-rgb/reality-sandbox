// World state for M2: ECS-lite with Agent and Resource entities and physics integration.

import { createEcs } from './ecs.js';

export function createWorld(rng) {
  const width = 800;
  const height = 480;

  const ecs = createEcs();

  const world = {
    tick: 0,
    width,
    height,
    ecs,
  };

  // Spawn some initial agents and resources
  const AGENT_COUNT = 20;
  const RESOURCE_COUNT = 40;

  for (let i = 0; i < AGENT_COUNT; i++) {
    const id = ecs.createEntity();
    ecs.components.position.set(id, {
      x: rng.float() * width,
      y: rng.float() * height,
    });
    ecs.components.velocity.set(id, {
      vx: (rng.float() - 0.5) * 40,
      vy: (rng.float() - 0.5) * 40,
    });
    ecs.components.agent.set(id, {
      colorHue: 200 + rng.int(-20, 20),
    });
  }

  for (let i = 0; i < RESOURCE_COUNT; i++) {
    const id = ecs.createEntity();
    ecs.components.position.set(id, {
      x: rng.float() * width,
      y: rng.float() * height,
    });
    ecs.components.resource.set(id, {
      amount: 1,
    });
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

  function step(dt) {
    world.tick++;
    physicsSystem(dt);
  }

  world.step = step;
  return world;
}
