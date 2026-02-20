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

    const { position, agent, resource } = ecs.components;

    // Draw resources as soft green circles
    for (const [id, res] of resource.entries()) {
      const pos = position.get(id);
      if (!pos) continue;
      const radius = 3 + res.amount * 2;
      ctx.fillStyle = 'rgba(130, 220, 160, 0.85)';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw agents as colored blobs with outline
    for (const [id, ag] of agent.entries()) {
      const pos = position.get(id);
      if (!pos) continue;
      const hue = ag.colorHue;
      const radius = 5;
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
