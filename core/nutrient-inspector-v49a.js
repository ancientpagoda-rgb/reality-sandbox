const UPDATE_MS = 900;

async function waitForRuntime() {
  while (true) {
    const origin = window.realitySandboxOriginMotileLifeV47;
    const inspector = window.realitySandboxEvolutionInspectorV47b;
    const nutrients = window.realitySandboxClosedNutrientCycleV49;
    const planet = window.realitySandboxPlanet;
    const host = document.getElementById('evolutionInspectorV47bHost');
    if (origin?.installed && inspector?.installed && nutrients?.installed && planet?.world?.ecs?.components && host?.shadowRoot) {
      return { origin, inspector, nutrients, planet, root: host.shadowRoot };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ origin, inspector, nutrients, planet, root }) {
  if (window.realitySandboxNutrientInspectorV49a?.installed) return;

  const { resource, position } = planet.world.ecs.components;

  const style = document.createElement('style');
  style.textContent = `
    .nutrient-v49a { margin-top:11px; padding:9px; border-radius:9px; background:rgba(255,255,255,.035); }
    .nutrient-v49a h3 { margin:0 0 7px; font-size:9px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; opacity:.58; }
    .nutrient-grid-v49a { display:grid; grid-template-columns:repeat(3,1fr); gap:5px; }
    .nutrient-grid-v49a div { padding:6px; border-radius:7px; background:rgba(255,255,255,.035); min-width:0; }
    .nutrient-grid-v49a b { display:block; font-size:10px; line-height:1.15; overflow:hidden; text-overflow:ellipsis; }
    .nutrient-grid-v49a span { display:block; margin-top:2px; font-size:7px; opacity:.48; text-transform:uppercase; }
    .nutrient-note-v49a { margin-top:6px; font-size:8px; line-height:1.35; opacity:.48; }
    @media (max-width:620px) { .nutrient-grid-v49a { grid-template-columns:repeat(2,1fr); } }
  `;
  root.appendChild(style);

  const record = root.querySelector('.record-v47e');
  const box = document.createElement('div');
  box.className = 'nutrient-v49a';
  box.innerHTML = '<h3>Nutrient ecology · v49</h3><div class="nutrient-grid-v49a"></div><div class="nutrient-note-v49a"></div>';
  if (record) record.insertAdjacentElement('afterend', box);
  else root.querySelector('.events')?.parentElement?.insertAdjacentElement('afterend', box);

  let renders = 0;
  let lastSelected = null;

  function samplesFor(lineageId) {
    const out = [];
    const motiles = origin.getMotiles?.() || [];
    for (const item of motiles) {
      if (item.lineageId !== lineageId || !item.position) continue;
      out.push({ kind: 'motile', ...nutrients.sample(item.position.x, item.position.y) });
    }
    for (const [id, res] of resource.entries()) {
      if (res.bioV47?.lineageId !== lineageId) continue;
      const p = position.get(id);
      if (!p) continue;
      out.push({ kind: 'plant', ...nutrients.sample(p.x, p.y), uptake: Number(res.bioV49?.uptake) || 0, toxinStress: Number(res.bioV49?.toxinStress) || 0 });
    }
    return out;
  }

  function render() {
    const selected = inspector.getStats?.().selectedLineageId;
    const grid = box.querySelector('.nutrient-grid-v49a');
    const note = box.querySelector('.nutrient-note-v49a');
    if (!grid || !note) return;

    const stats = nutrients.getStats();
    const samples = selected ? samplesFor(selected) : [];
    const mean = key => samples.length ? samples.reduce((sum, item) => sum + (Number(item[key]) || 0), 0) / samples.length : 0;
    const plantSamples = samples.filter(item => item.kind === 'plant');
    const plantMean = key => plantSamples.length ? plantSamples.reduce((sum, item) => sum + (Number(item[key]) || 0), 0) / plantSamples.length : 0;

    const localNutrient = mean('nutrient');
    const localToxin = mean('toxin');
    grid.innerHTML = [
      [samples.length ? `${Math.round(localNutrient * 100)}%` : '—', 'local nutrients'],
      [samples.length ? `${Math.round(localToxin * 100)}%` : '—', 'soil toxin'],
      [samples.length, 'members sampled'],
      [stats.detritusRecycled.toFixed(2), 'detritus recycled'],
      [stats.plantUptake.toFixed(2), 'plant uptake'],
      [stats.metabolicWasteDeposits.toFixed(2), 'waste returned'],
    ].map(([value, label]) => `<div><b>${value}</b><span>${label}</span></div>`).join('');

    const stress = plantMean('toxinStress');
    const uptake = plantMean('uptake');
    note.textContent = samples.length
      ? `Selected-lineage environment · mean plant uptake ${uptake.toFixed(4)} · mean toxin stress ${Math.round(stress * 100)}% · planet nutrient mean ${stats.meanNutrient.toFixed(2)}`
      : `No living members of the selected lineage currently have a nutrient-field location. Planet nutrient mean ${stats.meanNutrient.toFixed(2)}.`;

    lastSelected = selected || null;
    renders++;
  }

  root.querySelector('.lineage-select')?.addEventListener('change', () => queueMicrotask(render));
  let last = -Infinity;
  function loop(now) {
    requestAnimationFrame(loop);
    if (!inspector.isOpen?.() || now - last < UPDATE_MS) return;
    last = now;
    render();
  }
  requestAnimationFrame(loop);

  const api = {
    installed: true,
    render,
    getStats: () => ({
      installed: true,
      renders,
      selectedLineageId: lastSelected,
      lineageLocalNutrients: true,
      lineageSoilToxin: true,
      globalRecyclingTotals: true,
      surfaceRendererTouched: false,
    }),
  };
  window.realitySandboxNutrientInspectorV49a = api;
  document.documentElement.dataset.nutrientInspectorV49a = 'lineage-local-soil-context';
}

waitForRuntime().then(install);