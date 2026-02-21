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

    const { position, agent, predator, apex, resource, forceField } = ecs.components;

    // Regime overlay
    if (world.regime === 'storm') {
      ctx.fillStyle = 'rgba(180, 80, 160, 0.05)';
      ctx.fillRect(0, 0, width, height);
    }

    // Draw resources with continuous 10-stage growth (size + color change)
    for (const [id, res] of resource.entries()) {
      const pos = position.get(id);
      if (!pos) continue;
      const age = res.age ?? 0;
      const cycles = res.cycles ?? 0;

      // Map age into a 0–1 growth phase for color/branch timing within a cycle
      const maxAge = 3 * 9; // reference scale ≈ 27s
      const phase = Math.max(0, Math.min(1, age / maxAge));
      const stage = Math.floor(phase * 9); // 0–9 for discrete styling when needed

      // Growth factor: base smooth growth + slow, unbounded thickening over cycles
      const baseGrowth = 0.5 + phase * 0.7; // 0.5 → 1.2 within a cycle
      const extraGrowth = 1 + 0.4 * Math.log1p(cycles); // slowly increases per completed cycle
      const growthFactor = baseGrowth * extraGrowth;

      // Base radius from how eaten it is, then scaled by growth
      const baseRadius = 2 + res.amount * 3;
      const radius = baseRadius * growthFactor;

      // Color shifts smoothly with phase and kind
      const isPod = res.kind === 'pod';
      const baseG = isPod ? 210 : 220;
      const baseB = isPod ? 200 : 160;
      const baseR = isPod ? 150 : 130;
      const shade = baseR - phase * 18; // subtle darkening over full phase
      const g = baseG - phase * 13.5;
      const b = baseB - phase * 9;
      const alpha = 0.75 + phase * 0.15;
      const color = `rgba(${shade}, ${g}, ${b}, ${alpha})`;

      // Core patch
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Seed pods get a distinct outline
      if (isPod) {
        ctx.strokeStyle = `rgba(${shade + 20}, ${g + 10}, ${b + 20}, 0.9)`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius + 1, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Circuitboard-style branches: later growth phases sprout orthogonal traces
      if (phase >= 0.5) {
        const baseLen = radius * (0.8 + phase * 0.7);

        ctx.strokeStyle = `rgba(${shade}, ${g}, ${b}, 0.45)`;
        ctx.lineWidth = 0.7;

        const dirs = [
          { x: 1, y: 0 },
          { x: -1, y: 0 },
          { x: 0, y: 1 },
          { x: 0, y: -1 },
        ];

        // Number of arms increases with growth cycles (more branches each cycle)
        const baseArms = 2 + (id % 2); // 2–3
        const extraArms = Math.min(6, cycles); // +1 arm per cycle, up to +6
        const arms = baseArms + extraArms;

        for (let i = 0; i < arms; i++) {
          // Steps per arm also increase with cycles
          const baseSteps = 2 + ((id + i) % 2); // 2–3
          const extraSteps = Math.min(4, cycles); // up to +4 extra segments over many cycles
          const steps = baseSteps + extraSteps;

          let cx = pos.x;
          let cy = pos.y;

          ctx.beginPath();
          ctx.moveTo(cx, cy);

          // Pick a primary direction per arm (stable per id/arm)
          let dirIndex = (id + i) % dirs.length;

          for (let s = 0; s < steps; s++) {
            // Deterministic right-angle turns: every other segment, turn left/right
            if (s > 0 && (s % 2 === 0)) {
              const turn = ((id + s) % 2) === 0 ? 1 : -1;
              dirIndex = (dirIndex + turn + dirs.length) % dirs.length;
            }

            const dir = dirs[dirIndex];
            const segLen = baseLen * (0.4 + (s + 1) / (steps + 1) * 0.8); // longer segments later
            const prevX = cx;
            const prevY = cy;
            cx += dir.x * segLen;
            cy += dir.y * segLen;

            ctx.lineTo(cx, cy);

            // Side branches: small offshoots that make the structure more plant-like
            if (s > 0 && s < steps - 1 && (s + i + id) % 2 === 0) {
              const branchLen = segLen * 0.45;
              // perpendicular directions
              const off1 = { x: -dir.y, y: dir.x };
              const bx = cx + off1.x * branchLen;
              const by = cy + off1.y * branchLen;
              ctx.moveTo(cx, cy);
              ctx.lineTo(bx, by);
              ctx.moveTo(cx, cy);
            }
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

    // Draw predators as sharp shapes behind agents
    for (const [id, pred] of predator.entries()) {
      const pos = position.get(id);
      if (!pos) continue;
      const energy = pred.energy ?? 1.5;
      const age = pred.age ?? 0;
      const radiusBase = 6 + Math.min(4, energy * 2.5);
      const radius = age > 12 ? radiusBase * 1.15 : radiusBase;
      const hue = pred.colorHue;

      ctx.fillStyle = `hsla(${hue}, 85%, 55%, 0.95)`;
      ctx.strokeStyle = `hsla(${hue}, 95%, 35%, 1)`;
      ctx.lineWidth = 1.4;

      // Draw a rotated triangle (slow spin)
      const angle = (id * 0.7 + world.tick * 0.02) % (Math.PI * 2);
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = angle + (i * (Math.PI * 2 / 3));
        const x = pos.x + Math.cos(a) * radius;
        const y = pos.y + Math.sin(a) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Draw apex hunters as larger hexagons behind everything
    for (const [id, ap] of apex.entries()) {
      const pos = position.get(id);
      if (!pos) continue;
      const energy = ap.energy ?? 3;
      const age = ap.age ?? 0;
      const radiusBase = 9 + Math.min(6, energy * 2);
      const radius = age > 20 ? radiusBase * 1.2 : radiusBase;
      const hue = ap.colorHue;

      ctx.fillStyle = `hsla(${hue}, 70%, 60%, 0.85)`;
      ctx.strokeStyle = `hsla(${hue}, 95%, 35%, 0.95)`;
      ctx.lineWidth = 1.6;

      const angle = (id * 0.4 + world.tick * 0.01) % (Math.PI * 2);
      ctx.beginPath();
      const sides = 6;
      for (let i = 0; i < sides; i++) {
        const a = angle + (i * (Math.PI * 2 / sides));
        const x = pos.x + Math.cos(a) * radius;
        const y = pos.y + Math.sin(a) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
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
