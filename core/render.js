export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  let lastWorld = null;

  function resize(world) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  window.addEventListener('resize', () => {
    if (lastWorld) render(lastWorld);
  });

  function render(world) {
    lastWorld = world;
    resize(world);

    const { width, height, ecs } = world;
    ctx.clearRect(0, 0, width, height);

    // Background subtle grid
    ctx.fillStyle = 'rgba(10, 13, 30, 0.85)';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(70, 90, 180, 0.35)';
    ctx.lineWidth = 0.5;
    const grid = 80;
    for (let x = 0; x < width; x += grid) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += grid) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const { position, agent, resource, forceField } = ecs.components;

    // Regime overlay
    if (world.regime === 'storm') {
      ctx.fillStyle = 'rgba(180, 80, 160, 0.05)';
      ctx.fillRect(0, 0, width, height);
    }

    // Draw resources as soft green circles
    for (const [id, res] of resource.entries()) {
      const pos = position.get(id);
      if (!pos) continue;
      const radius = 2 + res.amount * 3;
      ctx.fillStyle = 'rgba(130, 220, 160, 0.85)';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw force fields as translucent circles
    for (const [id, field] of forceField.entries()) {
      const pos = position.get(id);
      if (!pos) continue;
      const color = field.strength >= 0
        ? 'rgba(120, 190, 255, 0.18)'
        : 'rgba(255, 140, 160, 0.18)';
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, field.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw agents as colored blobs with outline, radius maps to energy
    for (const [id, ag] of agent.entries()) {
      const pos = position.get(id);
      if (!pos) continue;
      const hue = ag.colorHue;
      const energy = ag.energy ?? 1;
      const radius = 4 + Math.min(2.5, energy * 2);
      ctx.fillStyle = `hsla(${hue}, 75%, 65%, 0.95)`;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `hsla(${hue}, 90%, 40%, 0.9)`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  return { render };
}
