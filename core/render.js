export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function resize(world) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  window.addEventListener('resize', () => {
    // Re-render on resize using last world snapshot
  });

  function render(world) {
    resize(world);

    const { width, height, particles } = world;
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

    // Particles (placeholder for entities)
    for (const p of particles) {
      const hue = 200 + (p.id % 40);
      ctx.fillStyle = `hsl(${hue}, 70%, 70%)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return { render };
}
