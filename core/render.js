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

    // Background "fog" gradient instead of grid
    const fog = ctx.createRadialGradient(
      width * 0.5,
      height * 0.4,
      20,
      width * 0.5,
      height * 0.7,
      Math.max(width, height) * 0.9,
    );
    fog.addColorStop(0, 'rgba(30, 42, 90, 0.9)');
    fog.addColorStop(0.5, 'rgba(8, 10, 30, 0.9)');
    fog.addColorStop(1, 'rgba(0, 0, 0, 1)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, 0, width, height);

    const { position, agent, resource, forceField } = ecs.components;

    // Regime overlay
    if (world.regime === 'storm') {
      ctx.fillStyle = 'rgba(180, 80, 160, 0.05)';
      ctx.fillRect(0, 0, width, height);
    }

    // Draw resources with 10 growth stages (smooth size + color change)
    for (const [id, res] of resource.entries()) {
      const pos = position.get(id);
      if (!pos) continue;
      const age = res.age ?? 0;

      // Map age into 10 stages
      const stageLen = 3; // seconds per stage
      let stage = Math.floor(age / stageLen);
      if (stage > 9) stage = 9;

      // Growth factor: starts small, grows smoothly toward full size
      const growthFactor = 0.5 + (stage / 9) * 0.7; // 0.5 → 1.2

      // Base radius from how eaten it is, then scaled by growth
      const baseRadius = 2 + res.amount * 3;
      const radius = baseRadius * growthFactor;

      // Color shifts slightly with stage
      const baseG = 220;
      const baseB = 160;
      const shade = 130 - stage * 2; // subtle darkening
      const g = baseG - stage * 1.5;
      const b = baseB - stage;
      const alpha = 0.75 + (stage / 9) * 0.15;
      const color = `rgba(${shade}, ${g}, ${b}, ${alpha})`;

      // Core patch
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Circuitboard-style branches: mature stages sprout orthogonal traces
      if (stage >= 5) {
        const arms = 3 + (id % 3); // 3–5 arms based on id
        const t = world.tick * 0.01;
        const baseLen = radius * (1.1 + stage / 15);

        ctx.strokeStyle = `rgba(${shade}, ${g}, ${b}, 0.45)`;
        ctx.lineWidth = 0.7;

        const dirs = [
          { x: 1, y: 0 },
          { x: -1, y: 0 },
          { x: 0, y: 1 },
          { x: 0, y: -1 },
        ];

        for (let i = 0; i < arms; i++) {
          const steps = 2 + ((id + i) % 3); // 2–4 segments
          let cx = pos.x;
          let cy = pos.y;

          ctx.beginPath();
          ctx.moveTo(cx, cy);

          // Pick a primary direction per arm
          let dirIndex = (id + i) % dirs.length;

          for (let s = 0; s < steps; s++) {
            // Occasionally turn 90° to form right angles
            const turnChance = 0.4;
            if (Math.sin(t * 0.7 + id * 0.13 + s) > 1 - turnChance) {
              dirIndex = (dirIndex + 1 + ((id + s) % 2) * 2) % dirs.length; // turn left or right
            }

            const dir = dirs[dirIndex];
            const segLen = baseLen * (0.5 + (s / (steps + 1)) * 0.8);
            cx += dir.x * segLen;
            cy += dir.y * segLen;

            ctx.lineTo(cx, cy);
          }

          ctx.stroke();

          // Small pad at the end of the trace
          const pad = radius * 0.18;
          ctx.fillStyle = `rgba(${shade}, ${g}, ${b}, 0.7)`;
          ctx.beginPath();
          ctx.rect(cx - pad / 2, cy - pad / 2, pad, pad);
          ctx.fill();
        }
      }
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
      const age = ag.age ?? 0;

      const young = age < 6;           // newly spawned
      const mature = age >= 6 && age < 20;
      const elder = age >= 20;

      let radius = 4 + Math.min(2.5, energy * 2);
      if (young) radius *= 0.75;
      else if (elder) radius *= 1.15;

      const evolved = ag.evolved;
      const caste = ag.caste || 'balanced';

      let sat = 78;
      let lightness = evolved ? 72 : 65;
      let fillAlpha = evolved ? 1.0 : 0.95;
      let strokeAlpha = evolved ? 1.0 : 0.9;
      let strokeWidth = evolved ? 1.5 : 1;

      if (young) {
        lightness += 4;
        fillAlpha = 0.9;
      } else if (elder) {
        lightness -= 3;
      }

      // Caste-based styling tweaks
      if (caste === 'scout') {
        sat = 85;
        lightness += 3;
      } else if (caste === 'runner') {
        sat = 92;
      } else if (caste === 'saver') {
        lightness -= 4;
        fillAlpha = 0.9;
      }

      ctx.fillStyle = `hsla(${hue}, ${sat}%, ${lightness}%, ${fillAlpha})`;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `hsla(${hue}, 95%, 40%, ${strokeAlpha})`;
      ctx.lineWidth = strokeWidth;
      ctx.stroke();

      // Small halo for evolved forms
      if (evolved) {
        ctx.strokeStyle = `hsla(${hue}, 90%, 80%, 0.5)`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius + 2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  return { render };
}
