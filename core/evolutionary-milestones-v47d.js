const SAMPLE_INTERVAL = 4.5;

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number(v) || 0));

async function waitForRuntime() {
  while (true) {
    const origin = window.realitySandboxOriginMotileLifeV47;
    const inspector = window.realitySandboxEvolutionInspectorV47b;
    const planet = window.realitySandboxPlanet;
    const modules = window.realitySandboxModules;
    const host = document.getElementById('evolutionInspectorV47bHost');
    if (origin?.installed && inspector?.installed && planet?.world?.ecs?.components && modules?.step && host?.shadowRoot) {
      return { origin, inspector, planet, modules, root: host.shadowRoot };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function averageGenome(items, fallback = {}) {
  if (!items.length) return { ...fallback };
  const keys = [
    'photosynthesis', 'heterotrophy', 'motility', 'sense', 'brainSpeed', 'sociality',
    'dormancy', 'toxin', 'neurotoxin', 'scavenging', 'aggression', 'armor',
    'seedInvestment', 'metabolism', 'bodySize',
  ];
  const out = {};
  for (const key of keys) out[key] = items.reduce((sum, item) => sum + (Number(item.genome?.[key]) || 0), 0) / items.length;
  return out;
}

function distance(a, b, world) {
  let dx = Math.abs(a.x - b.x);
  dx = Math.min(dx, world.width - dx);
  let dy = Math.abs(a.y - b.y);
  dy = Math.min(dy, world.height - dy);
  return Math.hypot(dx, dy);
}

function install({ origin, inspector, planet, modules, root }) {
  if (window.realitySandboxEvolutionaryMilestonesV47d?.installed) return;

  const { world, living } = planet;
  const { resource, position } = world.ecs.components;
  const milestones = [];
  const seen = new Set();
  const previousGenome = new Map();
  let accumulator = 0;
  let samples = 0;

  const rules = [
    { key: 'heterotrophy', threshold: 0.20, direction: 'up', title: 'External feeding emerges', detail: 'Heterotrophy crossed 20%.' },
    { key: 'motility', threshold: 0.18, direction: 'up', title: 'Locomotion emerges', detail: 'Motility crossed 18%.' },
    { key: 'sense', threshold: 0.30, direction: 'up', title: 'Expanded sensing', detail: 'Sensory investment crossed 30%.' },
    { key: 'brainSpeed', threshold: 0.25, direction: 'up', title: 'Faster decision loop', detail: 'Brain-speed investment crossed 25%.' },
    { key: 'sociality', threshold: 0.55, direction: 'up', title: 'Strong flocking tendency', detail: 'Sociality crossed 55%.' },
    { key: 'scavenging', threshold: 0.40, direction: 'up', title: 'Scavenging specialization', detail: 'Scavenging crossed 40%.' },
    { key: 'toxin', threshold: 0.35, direction: 'up', title: 'Chemical defense', detail: 'Toxin investment crossed 35%.' },
    { key: 'neurotoxin', threshold: 0.20, direction: 'up', title: 'Neurotoxic chemistry', detail: 'Neurotoxin investment crossed 20%.' },
    { key: 'armor', threshold: 0.50, direction: 'up', title: 'Heavy armor', detail: 'Armor investment crossed 50%.' },
    { key: 'photosynthesis', threshold: 0.45, direction: 'down', title: 'Photosynthesis no longer dominant', detail: 'Photosynthetic investment fell below 45%.' },
  ];

  const style = document.createElement('style');
  style.textContent = `
    .milestones-v47d { margin-top:11px; }
    .milestones-label-v47d { font-size:9px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; opacity:.58; margin:0 0 6px 2px; }
    .milestone-list-v47d { display:grid; gap:5px; }
    .milestone-v47d { padding:7px 8px; border-radius:8px; background:rgba(255,255,255,.035); border-left:2px solid rgba(155,220,175,.55); font-size:9px; line-height:1.38; }
    .milestone-v47d b { display:block; font-size:9px; color:#e8f5eb; margin-bottom:2px; }
    .milestone-v47d .context { opacity:.56; }
    .milestone-empty-v47d { padding:9px; border-radius:8px; background:rgba(255,255,255,.03); font-size:9px; opacity:.55; }
  `;
  root.appendChild(style);

  const events = root.querySelector('.events')?.parentElement;
  const section = document.createElement('div');
  section.className = 'milestones-v47d';
  section.innerHTML = '<div class="milestones-label-v47d">Evolutionary milestones</div><div class="milestone-list-v47d"></div>';
  events?.insertAdjacentElement('afterend', section);

  function membersFor(lineage) {
    if (lineage.type === 'motile') {
      return origin.getMotiles().filter(item => item.lineageId === lineage.id);
    }
    const items = [];
    for (const [id, res] of resource.entries()) {
      if (res.bioV47?.lineageId !== lineage.id) continue;
      items.push({ id, genome: res.bioV47.genome, position: position.get(id) ? { ...position.get(id) } : null });
    }
    return items;
  }

  function environmentFor(members) {
    const positions = members.map(item => item.position).filter(Boolean);
    if (!positions.length) return { moisture: null, fertility: null, temperature: null, crowding: null, storminess: clamp(world.globals?.storminess) };
    const center = {
      x: positions.reduce((sum, p) => sum + p.x, 0) / positions.length,
      y: positions.reduce((sum, p) => sum + p.y, 0) / positions.length,
    };
    const climate = living?.sampleDynamicPlanet?.(center.x, center.y, 'evolution-milestone-v47d') || {};
    let neighbors = 0;
    for (const [id] of resource.entries()) {
      const p = position.get(id);
      if (p && distance(center, p, world) <= 80) neighbors++;
    }
    return {
      moisture: Number.isFinite(Number(climate.moisture ?? climate.rainfall)) ? clamp(climate.moisture ?? climate.rainfall) : null,
      fertility: Number.isFinite(Number(climate.fertility)) ? clamp(climate.fertility) : null,
      temperature: Number.isFinite(Number(climate.temperature)) ? clamp(climate.temperature) : null,
      crowding: clamp(neighbors / 12),
      storminess: clamp(world.globals?.storminess),
    };
  }

  function contextText(env) {
    const parts = [];
    if (env.fertility != null && env.fertility < 0.38) parts.push('low fertility');
    else if (env.fertility != null && env.fertility > 0.72) parts.push('high fertility');
    if (env.moisture != null && env.moisture < 0.32) parts.push('dry conditions');
    else if (env.moisture != null && env.moisture > 0.72) parts.push('wet conditions');
    if (env.crowding != null && env.crowding > 0.58) parts.push('dense local biomass');
    if (env.storminess > 0.45) parts.push('high disturbance');
    return parts.length ? parts.join(', ') : 'moderate local conditions';
  }

  function record(lineage, title, detail, genome, env, kind = 'trait') {
    const id = `${lineage.id}:${kind}:${title}`;
    if (seen.has(id)) return;
    seen.add(id);
    milestones.push({
      id,
      lineageId: lineage.id,
      tick: world.tick,
      title,
      detail,
      context: contextText(env),
      genome: { ...genome },
      environment: { ...env },
      kind,
    });
    if (milestones.length > 300) milestones.splice(0, milestones.length - 300);
  }

  function sample() {
    const lineages = origin.getLineages();
    for (const lineage of lineages) {
      const members = membersFor(lineage);
      const genome = averageGenome(members, lineage.genome || {});
      const env = environmentFor(members);
      const prev = previousGenome.get(lineage.id);

      if (!prev) {
        previousGenome.set(lineage.id, { ...genome });
        if (lineage.parentId) {
          record(lineage, lineage.type === 'motile' ? 'New motile lineage' : 'New lineage branch', `Diverged from ${lineage.parentId} as ${lineage.form || lineage.type}.`, genome, env, 'branch');
        }
        continue;
      }

      for (const rule of rules) {
        const before = Number(prev[rule.key]) || 0;
        const now = Number(genome[rule.key]) || 0;
        const crossed = rule.direction === 'up'
          ? before < rule.threshold && now >= rule.threshold
          : before >= rule.threshold && now < rule.threshold;
        if (crossed) record(lineage, rule.title, rule.detail, genome, env, rule.key);
      }

      const predKey = `${lineage.id}:predatory-transition`;
      if (!seen.has(predKey) && genome.aggression >= 0.45 && genome.heterotrophy >= 0.50) {
        seen.add(predKey);
        milestones.push({ id: predKey, lineageId: lineage.id, tick: world.tick, title: 'Active predation emerges', detail: 'Aggression and heterotrophy jointly crossed the predatory threshold.', context: contextText(env), genome: { ...genome }, environment: { ...env }, kind: 'predation' });
      }
      previousGenome.set(lineage.id, { ...genome });
    }
    samples++;
    render();
  }

  function render() {
    const selected = inspector.getStats?.().selectedLineageId;
    const target = section.querySelector('.milestone-list-v47d');
    if (!target) return;
    const relevant = milestones.filter(item => !selected || item.lineageId === selected).slice(-10).reverse();
    target.innerHTML = relevant.length
      ? relevant.map(item => `<div class="milestone-v47d"><b>tick ${item.tick} · ${item.title}</b>${item.detail}<div class="context">Context: ${item.context}</div></div>`).join('')
      : '<div class="milestone-empty-v47d">No threshold-crossing milestone recorded for this lineage yet.</div>';
  }

  const previousStep = modules.step.bind(modules);
  modules.step = function milestoneAwareStep(dt) {
    const result = previousStep(dt);
    accumulator += dt;
    if (accumulator >= SAMPLE_INTERVAL) {
      accumulator %= SAMPLE_INTERVAL;
      sample();
    }
    return result;
  };

  root.querySelector('.lineage-select')?.addEventListener('change', () => queueMicrotask(render));

  const api = {
    installed: true,
    sample,
    render,
    getMilestones: lineageId => milestones.filter(item => !lineageId || item.lineageId === lineageId).map(item => ({ ...item, genome: { ...item.genome }, environment: { ...item.environment } })),
    getStats: () => ({ installed: true, samples, milestones: milestones.length, causalContextRecorded: true, thresholdCrossings: true, environmentalContext: true, authoritativeFixedStep: true }),
  };
  window.realitySandboxEvolutionaryMilestonesV47d = api;
  document.documentElement.dataset.evolutionaryMilestonesV47d = 'thresholds-with-context';

  sample();
}

waitForRuntime().then(install);
