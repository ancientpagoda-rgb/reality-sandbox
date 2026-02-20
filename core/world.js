// World state for M1: just a grid of particles to prove determinism & rendering.

export function createWorld(rng) {
  const width = 800;
  const height = 480;

  const particles = [];
  const COUNT = 80;

  for (let i = 0; i < COUNT; i++) {
    particles.push({
      id: i,
      x: rng.float() * width,
      y: rng.float() * height,
      vx: (rng.float() - 0.5) * 30,
      vy: (rng.float() - 0.5) * 30,
      radius: 3 + rng.float() * 2,
    });
  }

  const world = {
    tick: 0,
    width,
    height,
    particles,
  };

  function step(dt) {
    world.tick++;
    const w = world.width;
    const h = world.height;
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Wrap bounds
      if (p.x < 0) p.x += w;
      if (p.x >= w) p.x -= w;
      if (p.y < 0) p.y += h;
      if (p.y >= h) p.y -= h;
    }
  }

  world.step = step;
  return world;
}
