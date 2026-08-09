const UPDATE_MS = 700;
const TRAITS = [
  ['photosynthesis', 'Photosynthesis'],
  ['heterotrophy', 'Feeding'],
  ['motility', 'Motility'],
  ['sense', 'Senses'],
  ['brainSpeed', 'Brain speed'],
  ['sociality', 'Flocking'],
  ['dormancy', 'Dormancy / sleep'],
  ['scavenging', 'Scavenging'],
  ['aggression', 'Aggression'],
  ['toxin', 'Toxin'],
  ['neurotoxin', 'Neurotoxin'],
  ['armor', 'Armor'],
  ['metabolism', 'Metabolism'],
  ['bodySize', 'Body size'],
  ['seedInvestment', 'Seed investment'],
];

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number(v) || 0));
const pct = v => `${Math.round(clamp(v) * 100)}%`;
const one = v => Number.isFinite(Number(v)) ? Number(v).toFixed(2) : '—';

async function waitForRuntime() {
  while (true) {
    const api = window.realitySandboxOriginMotileLifeV47;
    if (api?.installed && api?.getLineages && api?.getAncestry && api?.getMotiles) return api;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install(api) {
  if (window.realitySandboxEvolutionInspectorV47b?.installed) return;

  const host = document.createElement('div');
  host.id = 'evolutionInspectorV47bHost';
  host.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:240;pointer-events:none;';
  const shadow = host.attachShadow({ mode: 'open' });
  document.body.appendChild(host);

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      button, select { font: inherit; }
      .wrap { pointer-events:auto; font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:#edf7ef; }
      .toggle { border:1px solid rgba(180,235,195,.28); background:rgba(7,18,15,.92); color:#d9f5de; padding:9px 12px; border-radius:10px; cursor:pointer; box-shadow:0 8px 28px rgba(0,0,0,.28); letter-spacing:.08em; font-size:11px; font-weight:800; }
      .toggle:hover { background:rgba(12,29,24,.96); }
      .panel { width:min(430px,calc(100vw - 24px)); max-height:min(74vh,680px); display:none; flex-direction:column; overflow:hidden; border:1px solid rgba(180,235,195,.24); border-radius:14px; background:rgba(5,14,12,.96); box-shadow:0 18px 52px rgba(0,0,0,.46); backdrop-filter:blur(12px); }
      .panel.open { display:flex; }
      .toggle.hidden { display:none; }
      .head { display:flex; align-items:center; justify-content:space-between; padding:12px 13px 10px; border-bottom:1px solid rgba(255,255,255,.08); }
      .title { font-size:12px; font-weight:900; letter-spacing:.13em; }
      .sub { font-size:10px; opacity:.55; margin-top:2px; letter-spacing:.04em; }
      .close { width:30px; height:30px; border:0; border-radius:8px; background:rgba(255,255,255,.06); color:#fff; cursor:pointer; font-size:18px; }
      .scroll { overflow:auto; padding:11px 12px 14px; scrollbar-width:thin; }
      .summary { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin-bottom:10px; }
      .metric { padding:8px 7px; border-radius:9px; background:rgba(255,255,255,.045); min-width:0; }
      .metric b { display:block; font-size:15px; line-height:1; }
      .metric span { display:block; font-size:8px; text-transform:uppercase; opacity:.52; margin-top:4px; letter-spacing:.06em; }
      .section { margin-top:11px; }
      .section-label { font-size:9px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; opacity:.58; margin:0 0 6px 2px; }
      select { width:100%; padding:9px 10px; border:1px solid rgba(255,255,255,.09); border-radius:9px; background:#0c1c17; color:#effbf2; outline:none; }
      .species { padding:10px; border-radius:10px; background:rgba(255,255,255,.038); }
      .species h2 { font-size:17px; line-height:1.1; margin:0 0 7px; }
      .chips { display:flex; flex-wrap:wrap; gap:5px; }
      .chip { padding:4px 6px; border-radius:999px; background:rgba(138,215,159,.10); border:1px solid rgba(138,215,159,.14); font-size:9px; }
      .ancestry { font-size:10px; line-height:1.5; color:#cde2d2; overflow-wrap:anywhere; }
      .traits { display:grid; gap:6px; }
      .trait { display:grid; grid-template-columns:106px 1fr 37px; gap:7px; align-items:center; }
      .trait-name { font-size:9px; opacity:.74; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .bar { height:7px; border-radius:999px; background:rgba(255,255,255,.07); overflow:hidden; position:relative; }
      .bar > i { display:block; height:100%; border-radius:inherit; background:linear-gradient(90deg,#79c98f,#d7e995); }
      .bar > em { position:absolute; top:0; bottom:0; width:1px; background:#fff; opacity:.55; }
      .trait-val { text-align:right; font-size:9px; opacity:.72; }
      .legend { font-size:8px; opacity:.44; margin:5px 0 0 113px; }
      .behavior { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; }
      .behavior div { padding:7px; border-radius:8px; background:rgba(255,255,255,.04); }
      .behavior b { font-size:12px; display:block; }
      .behavior span { font-size:8px; opacity:.5; text-transform:uppercase; }
      .events { display:grid; gap:5px; }
      .event { padding:7px 8px; border-left:2px solid rgba(144,224,166,.55); background:rgba(255,255,255,.03); font-size:9px; line-height:1.35; }
      .empty { padding:10px; border-radius:9px; background:rgba(255,255,255,.03); font-size:10px; opacity:.6; }
      @media (max-width:620px) {
        .panel { width:calc(100vw - 20px); max-height:72vh; }
        .summary { grid-template-columns:repeat(2,1fr); }
        .trait { grid-template-columns:94px 1fr 34px; }
        .legend { margin-left:101px; }
      }
    </style>
    <div class="wrap">
      <button class="toggle" type="button">EVOLUTION</button>
      <section class="panel" aria-label="Evolution and species inspector">
        <div class="head">
          <div><div class="title">EVOLUTION / SPECIES</div><div class="sub">v47 · plant → motile continuum</div></div>
          <button class="close" type="button" aria-label="Close evolution inspector">×</button>
        </div>
        <div class="scroll">
          <div class="summary"></div>
          <div class="section">
            <div class="section-label">Lineage</div>
            <select class="lineage-select" aria-label="Select lineage"></select>
          </div>
          <div class="section species"></div>
          <div class="section">
            <div class="section-label">Ancestry</div>
            <div class="ancestry"></div>
          </div>
          <div class="section">
            <div class="section-label">Genome · current average vs founding marker</div>
            <div class="traits"></div>
            <div class="legend">bar = living average · white marker = lineage founding genome</div>
          </div>
          <div class="section">
            <div class="section-label">Living behavior</div>
            <div class="behavior"></div>
          </div>
          <div class="section">
            <div class="section-label">Recent branches</div>
            <div class="events"></div>
          </div>
        </div>
      </section>
    </div>`;

  const q = sel => shadow.querySelector(sel);
  const panel = q('.panel');
  const toggle = q('.toggle');
  const close = q('.close');
  const select = q('.lineage-select');
  let open = false;
  let selectedId = null;
  let lastUpdate = -Infinity;
  let renderCount = 0;

  function setOpen(value) {
    open = Boolean(value);
    panel.classList.toggle('open', open);
    toggle.classList.toggle('hidden', open);
    if (open) render(true);
  }

  function meanGenome(members, fallback) {
    if (!members.length) return fallback || {};
    const out = {};
    for (const [key] of TRAITS) {
      let total = 0;
      for (const member of members) total += Number(member.genome?.[key]) || 0;
      out[key] = total / members.length;
    }
    return out;
  }

  function lineagePath(lineage, byId) {
    const path = [];
    let current = lineage;
    const visited = new Set();
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      path.unshift(current);
      current = current.parentId ? byId.get(current.parentId) : null;
    }
    return path;
  }

  function classification(g, fallback = 'plant') {
    if (!g) return fallback;
    if ((g.aggression || 0) > .62 && (g.heterotrophy || 0) > .64) return 'predatory motile';
    if ((g.scavenging || 0) > .62 && (g.heterotrophy || 0) > .48) return 'scavenger';
    if ((g.heterotrophy || 0) > .56 && (g.photosynthesis || 0) < .45) return 'heterotroph';
    if ((g.heterotrophy || 0) > .28 && (g.motility || 0) > .30) return 'mixotroph';
    if ((g.motility || 0) > .18) return 'motile photoautotroph';
    return fallback;
  }

  function render(force = false) {
    if (!open && !force) return;
    const stats = api.getStats?.() || {};
    const lineages = api.getLineages?.() || [];
    const ancestry = api.getAncestry?.() || [];
    const motiles = api.getMotiles?.() || [];
    const byId = new Map(lineages.map(x => [x.id, x]));

    if (!selectedId || !byId.has(selectedId)) {
      const preferred = [...lineages].reverse().find(x => x.type === 'motile') || lineages.find(x => x.population > 0) || lineages[0];
      selectedId = preferred?.id || null;
    }

    q('.summary').innerHTML = [
      [stats.plantLineages || 0, 'flora lineages'],
      [stats.motileLineages || 0, 'motile lineages'],
      [stats.motilePopulation || 0, 'motile lives'],
      [stats.originsFromPlants || 0, 'plant origins'],
    ].map(([value, label]) => `<div class="metric"><b>${value}</b><span>${label}</span></div>`).join('');

    const sorted = [...lineages].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'motile' ? -1 : 1;
      if ((b.population || 0) !== (a.population || 0)) return (b.population || 0) - (a.population || 0);
      return (a.generation || 0) - (b.generation || 0);
    });
    select.innerHTML = sorted.length
      ? sorted.map(x => `<option value="${x.id}" ${x.id === selectedId ? 'selected' : ''}>${x.type === 'motile' ? '◆' : '♧'} ${x.name} · ${x.population || 0}</option>`).join('')
      : '<option>No lineages yet</option>';

    const lineage = selectedId ? byId.get(selectedId) : null;
    if (!lineage) {
      q('.species').innerHTML = '<div class="empty">Plant lineages are initializing.</div>';
      q('.ancestry').textContent = '—';
      q('.traits').innerHTML = '';
      q('.behavior').innerHTML = '<div class="empty">No living lineage selected.</div>';
      q('.events').innerHTML = '<div class="empty">No branching events yet.</div>';
      return;
    }

    const members = motiles.filter(x => x.lineageId === lineage.id);
    const livingGenome = meanGenome(members, lineage.genome);
    const form = members.length ? classification(livingGenome, lineage.form) : (lineage.form || classification(lineage.genome, 'plant'));
    q('.species').innerHTML = `
      <h2>${lineage.name}</h2>
      <div class="chips">
        <span class="chip">${lineage.type}</span>
        <span class="chip">${form}</span>
        <span class="chip">generation ${lineage.generation || 0}</span>
        <span class="chip">population ${lineage.population || 0}</span>
      </div>`;

    const path = lineagePath(lineage, byId);
    q('.ancestry').textContent = path.map(x => x.name).join('  →  ') || lineage.name;

    q('.traits').innerHTML = TRAITS.map(([key, label]) => {
      const live = clamp(livingGenome?.[key]);
      const founder = clamp(lineage.genome?.[key]);
      return `<div class="trait" title="Founding ${pct(founder)} · current ${pct(live)}">
        <span class="trait-name">${label}</span>
        <span class="bar"><i style="width:${pct(live)}"></i><em style="left:${pct(founder)}"></em></span>
        <span class="trait-val">${pct(live)}</span>
      </div>`;
    }).join('');

    if (members.length) {
      const sleeping = members.filter(x => x.state === 'sleeping').length;
      const avg = key => members.reduce((sum, x) => sum + (Number(x[key]) || 0), 0) / members.length;
      q('.behavior').innerHTML = [
        [members.length, 'living'],
        [sleeping, 'sleeping'],
        [one(avg('energy')), 'energy'],
        [one(avg('age')), 'age'],
        [one(avg('sleepDebt')), 'sleep debt'],
        [one(avg('neurotoxinLoad')), 'neuro load'],
      ].map(([value, label]) => `<div><b>${value}</b><span>${label}</span></div>`).join('');
    } else {
      q('.behavior').innerHTML = `<div class="empty">No currently living motile individuals in this lineage. The lineage remains in the ancestry record.</div>`;
    }

    const relevant = ancestry
      .filter(x => x.parentId === lineage.id || x.childId === lineage.id)
      .slice(-8)
      .reverse();
    q('.events').innerHTML = relevant.length
      ? relevant.map(event => {
          const child = byId.get(event.childId);
          const parent = byId.get(event.parentId);
          return `<div class="event">tick ${event.tick ?? '—'} · ${parent?.name || event.parentId || 'origin'} → ${child?.name || event.childId} · ${event.transition || 'branch'}</div>`;
        }).join('')
      : '<div class="empty">No branch event recorded for this lineage yet.</div>';

    renderCount++;
  }

  toggle.addEventListener('click', () => setOpen(true));
  close.addEventListener('click', () => setOpen(false));
  select.addEventListener('change', () => { selectedId = select.value; render(true); });
  window.addEventListener('keydown', event => {
    if (event.code === 'Escape' && open && document.documentElement.dataset.surfaceMode !== 'active') setOpen(false);
  });

  function loop(now) {
    requestAnimationFrame(loop);
    if (!open || now - lastUpdate < UPDATE_MS) return;
    lastUpdate = now;
    render();
  }
  requestAnimationFrame(loop);

  const inspectorApi = {
    installed: true,
    open: () => setOpen(true),
    close: () => setOpen(false),
    isOpen: () => open,
    selectLineage(id) {
      selectedId = String(id || '');
      setOpen(true);
      render(true);
    },
    getStats: () => ({
      installed: true,
      open,
      selectedLineageId: selectedId,
      renderCount,
      collapsedByDefault: true,
      shadowDomIsolated: true,
      lineageBrowser: true,
      ancestryView: true,
      liveGenomeDrift: true,
      gooGridBehaviorMetrics: true,
    }),
  };

  window.realitySandboxEvolutionInspectorV47b = inspectorApi;
  document.documentElement.dataset.evolutionInspectorV47b = 'ready-collapsed';
}

waitForRuntime().then(install);
