const SAMPLE_INTERVAL = 9;
const MAX_SAMPLES = 96;

async function waitForRuntime() {
  while (true) {
    const origin = window.realitySandboxOriginMotileLifeV47;
    const inspector = window.realitySandboxEvolutionInspectorV47b;
    const modules = window.realitySandboxModules;
    const planet = window.realitySandboxPlanet;
    const host = document.getElementById('evolutionInspectorV47bHost');
    if (origin?.installed && inspector?.installed && modules?.step && planet?.world?.ecs?.components && host?.shadowRoot) {
      return { origin, inspector, modules, planet, root: host.shadowRoot };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ origin, inspector, modules, planet, root }) {
  if (window.realitySandboxLineagePopulationRecordV47e?.installed) return;

  const { world } = planet;
  const { resource, position } = world.ecs.components;
  const records = new Map();
  let accumulator = 0;
  let samples = 0;

  const style = document.createElement('style');
  style.textContent = `
    .record-v47e { margin-top:11px; }
    .record-label-v47e { font-size:9px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; opacity:.58; margin:0 0 6px 2px; }
    .record-card-v47e { padding:8px; border-radius:9px; background:rgba(255,255,255,.035); }
    .record-stats-v47e { display:grid; grid-template-columns:repeat(4,1fr); gap:5px; margin-bottom:7px; }
    .record-stats-v47e div { padding:6px; border-radius:7px; background:rgba(255,255,255,.035); min-width:0; }
    .record-stats-v47e b { display:block; font-size:11px; }
    .record-stats-v47e span { display:block; font-size:7px; opacity:.48; text-transform:uppercase; margin-top:2px; }
    .record-spark-v47e { width:100%; height:54px; display:block; }
    .record-spark-v47e .axis { stroke:rgba(255,255,255,.08); stroke-width:1; }
    .record-spark-v47e .line { fill:none; stroke:#9ed5aa; stroke-width:2; vector-effect:non-scaling-stroke; }
    .record-spark-v47e .area { fill:rgba(125,202,145,.08); }
    .record-meta-v47e { margin-top:5px; font-size:8px; opacity:.52; display:flex; gap:10px; flex-wrap:wrap; }
    .record-empty-v47e { padding:9px; border-radius:8px; background:rgba(255,255,255,.03); font-size:9px; opacity:.55; }
    @media (max-width:620px) { .record-stats-v47e { grid-template-columns:repeat(2,1fr); } }
  `;
  root.appendChild(style);

  const milestoneSection = root.querySelector('.milestones-v47d');
  const section = document.createElement('div');
  section.className = 'record-v47e';
  section.innerHTML = '<div class="record-label-v47e">Lineage population record</div><div class="record-body-v47e"></div>';
  if (milestoneSection) milestoneSection.insertAdjacentElement('afterend', section);
  else root.querySelector('.events')?.parentElement?.insertAdjacentElement('afterend', section);

  function getMembers(lineageId, type) {
    if (type === 'motile') return origin.getMotiles().filter(item => item.lineageId === lineageId);
    const out = [];
    for (const [id, res] of resource.entries()) {
      if (res.bioV47?.lineageId !== lineageId) continue;
      out.push({ id, position: position.get(id) ? { ...position.get(id) } : null });
    }
    return out;
  }

  function circularMeanX(positions) {
    if (!positions.length) return null;
    let sx = 0, cx = 0;
    for (const p of positions) {
      const angle = (p.x / world.width) * Math.PI * 2;
      sx += Math.sin(angle);
      cx += Math.cos(angle);
    }
    let angle = Math.atan2(sx / positions.length, cx / positions.length);
    if (angle < 0) angle += Math.PI * 2;
    return (angle / (Math.PI * 2)) * world.width;
  }

  function rangeFor(lineageId, type) {
    const positions = getMembers(lineageId, type).map(item => item.position).filter(Boolean);
    if (!positions.length) return { lon: null, lat: null, spread: 0 };
    const centerX = circularMeanX(positions);
    const centerY = positions.reduce((sum, p) => sum + p.y, 0) / positions.length;
    let spread = 0;
    for (const p of positions) {
      let dx = Math.abs(p.x - centerX);
      dx = Math.min(dx, world.width - dx);
      const dy = Math.abs(p.y - centerY);
      spread = Math.max(spread, Math.hypot(dx, dy));
    }
    return {
      lon: ((centerX / world.width) * 360) - 180,
      lat: 90 - (centerY / world.height) * 180,
      spread,
    };
  }

  function sample() {
    const lineages = origin.getLineages();
    const active = new Set();
    for (const lineage of lineages) {
      active.add(lineage.id);
      let record = records.get(lineage.id);
      if (!record) {
        record = {
          lineageId: lineage.id,
          type: lineage.type,
          name: lineage.name,
          firstTick: world.tick,
          lastSeenTick: lineage.population > 0 ? world.tick : null,
          peakPopulation: 0,
          extinctTick: null,
          samples: [],
          lastRange: { lon: null, lat: null, spread: 0 },
        };
        records.set(lineage.id, record);
      }
      const population = Math.max(0, Number(lineage.population) || 0);
      record.name = lineage.name;
      record.type = lineage.type;
      record.peakPopulation = Math.max(record.peakPopulation, population);
      if (population > 0) {
        record.lastSeenTick = world.tick;
        record.extinctTick = null;
        record.lastRange = rangeFor(lineage.id, lineage.type);
      } else if (record.lastSeenTick != null && record.extinctTick == null) {
        record.extinctTick = world.tick;
      }
      record.samples.push({ tick: world.tick, population });
      if (record.samples.length > MAX_SAMPLES) record.samples.splice(0, record.samples.length - MAX_SAMPLES);
    }
    samples++;
    render();
  }

  function sparkline(record) {
    const points = record.samples;
    if (!points.length) return '';
    const width = 360;
    const height = 54;
    const pad = 4;
    const peak = Math.max(1, ...points.map(p => p.population));
    const coords = points.map((p, index) => {
      const x = pad + (points.length === 1 ? 0 : index / (points.length - 1)) * (width - pad * 2);
      const y = height - pad - (p.population / peak) * (height - pad * 2);
      return [x, y];
    });
    const line = coords.map((p, i) => `${i ? 'L' : 'M'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    const area = `${line} L ${coords.at(-1)[0].toFixed(1)} ${height - pad} L ${coords[0][0].toFixed(1)} ${height - pad} Z`;
    return `<svg class="record-spark-v47e" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="Population history sparkline"><line x1="0" y1="${height - pad}" x2="${width}" y2="${height - pad}" class="axis"/><path d="${area}" class="area"/><path d="${line}" class="line"/></svg>`;
  }

  function render() {
    const target = section.querySelector('.record-body-v47e');
    if (!target) return;
    const selected = inspector.getStats?.().selectedLineageId;
    const record = selected ? records.get(selected) : null;
    const lineage = selected ? origin.getLineages().find(item => item.id === selected) : null;
    if (!record || !lineage) {
      target.innerHTML = '<div class="record-empty-v47e">No lineage record selected yet.</div>';
      return;
    }
    const pop = Math.max(0, Number(lineage.population) || 0);
    const status = pop > 0 ? 'extant' : record.extinctTick != null ? 'extinct' : 'absent';
    const range = record.lastRange || {};
    const lon = Number.isFinite(range.lon) ? `${Math.abs(range.lon).toFixed(1)}°${range.lon < 0 ? 'W' : 'E'}` : '—';
    const lat = Number.isFinite(range.lat) ? `${Math.abs(range.lat).toFixed(1)}°${range.lat < 0 ? 'S' : 'N'}` : '—';
    target.innerHTML = `<div class="record-card-v47e">
      <div class="record-stats-v47e">
        <div><b>${status}</b><span>status</span></div>
        <div><b>${record.peakPopulation}</b><span>peak pop</span></div>
        <div><b>${record.firstTick}</b><span>first tick</span></div>
        <div><b>${record.extinctTick ?? '—'}</b><span>extinct tick</span></div>
      </div>
      ${sparkline(record)}
      <div class="record-meta-v47e"><span>last range center ${lat}, ${lon}</span><span>spread ${Math.round(range.spread || 0)} world units</span><span>${record.samples.length} historical samples</span></div>
    </div>`;
  }

  const previousStep = modules.step.bind(modules);
  modules.step = function populationRecordStep(dt) {
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
    getRecord: lineageId => {
      const record = records.get(lineageId);
      return record ? { ...record, samples: record.samples.map(item => ({ ...item })), lastRange: { ...record.lastRange } } : null;
    },
    getStats: () => ({ installed: true, samples, trackedLineages: records.size, populationHistory: true, extinctionTracking: true, geographicRange: true, authoritativeFixedStep: true }),
  };
  window.realitySandboxLineagePopulationRecordV47e = api;
  document.documentElement.dataset.lineagePopulationRecordV47e = 'population-extinction-range';

  sample();
}

waitForRuntime().then(install);
