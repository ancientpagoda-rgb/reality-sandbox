const UPDATE_MS = 1000;

async function waitForRuntime() {
  while (true) {
    const culture = window.realitySandboxProtoCultureV53;
    const inspector = window.realitySandboxEvolutionInspectorV47b;
    const host = document.getElementById('evolutionInspectorV47bHost');
    if (culture?.installed && inspector?.installed && host?.shadowRoot) return { culture, inspector, root:host.shadowRoot };
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ culture, inspector, root }) {
  if (window.realitySandboxProtoCultureInspectorV53a?.installed) return;
  const style = document.createElement('style');
  style.textContent = `
    .culture-v53 { margin-top:11px; }
    .culture-v53-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; }
    .culture-v53-card { padding:8px; border-radius:9px; background:rgba(255,255,255,.038); }
    .culture-v53-card b { display:block; font-size:13px; }
    .culture-v53-card span { display:block; margin-top:3px; font-size:8px; text-transform:uppercase; letter-spacing:.06em; opacity:.5; }
    .culture-v53-note { margin-top:7px; padding:7px 8px; border-radius:8px; background:rgba(132,205,154,.07); font-size:8px; line-height:1.45; opacity:.65; }
  `;
  root.appendChild(style);

  const memorySection = root.querySelector('.memory-v52');
  const socialSection = root.querySelector('.social-v51');
  const anchor = memorySection || socialSection || root.querySelector('.behavior')?.closest('.section');
  if (!anchor) return;

  const section = document.createElement('div');
  section.className = 'section culture-v53';
  section.innerHTML = '<div class="section-label">Proto-culture</div><div class="culture-v53-body"></div>';
  anchor.insertAdjacentElement('afterend', section);

  let renders = 0;
  let last = 0;

  function render() {
    const selected = inspector.getStats?.().selectedLineageId;
    const population = culture.getPopulationCulture?.() || [];
    const lineage = selected ? population.filter(item => item.lineageId === selected) : [];
    const stats = culture.getStats?.() || {};
    const body = section.querySelector('.culture-v53-body');
    if (!selected) {
      body.innerHTML = '<div class="empty">Select a lineage to inspect learned traditions.</div>';
      renders++;
      return;
    }

    const counts = { 'food-route':0, 'danger-avoidance':0, 'pack-hunt':0 };
    const applied = {};
    let openness = 0;
    let conformity = 0;
    for (const item of lineage) {
      const c = item.culture;
      if (!c) continue;
      for (const key of Object.keys(counts)) if (c.practices[key]) counts[key]++;
      if (c.appliedPractice) applied[c.appliedPractice] = (applied[c.appliedPractice] || 0) + 1;
      openness += Number(c.openness) || 0;
      conformity += Number(c.conformity) || 0;
    }
    const n = lineage.length || 1;
    const dominant = Object.entries(counts).sort((a,b) => b[1] - a[1])[0];
    const activeApplied = Object.values(applied).reduce((a,b) => a + b, 0);
    body.innerHTML = `
      <div class="culture-v53-grid">
        <div class="culture-v53-card"><b>${counts['food-route']}</b><span>food-route tradition</span></div>
        <div class="culture-v53-card"><b>${counts['danger-avoidance']}</b><span>danger tradition</span></div>
        <div class="culture-v53-card"><b>${counts['pack-hunt']}</b><span>pack-hunt tradition</span></div>
      </div>
      <div class="culture-v53-note">Dominant tradition: ${dominant?.[1] ? dominant[0] : 'none'}. Cultural guidance active: ${activeApplied}/${lineage.length}. Mean openness ${(openness / n).toFixed(2)} · conformity ${(conformity / n).toFixed(2)}. Global transmissions: ${stats.adoptions || 0} adoptions · ${stats.reinforcements || 0} reinforcements · ${stats.intergenerationalTransmissions || 0} cross-generation.</div>`;
    renders++;
  }

  const originalSelect = inspector.selectLineage?.bind(inspector);
  if (originalSelect) inspector.selectLineage = id => { const result = originalSelect(id); queueMicrotask(render); return result; };
  root.querySelector('.lineage-select')?.addEventListener('change', () => queueMicrotask(render));

  function loop(now) {
    requestAnimationFrame(loop);
    if (!inspector.isOpen?.() || now - last < UPDATE_MS) return;
    last = now;
    render();
  }
  requestAnimationFrame(loop);
  render();

  window.realitySandboxProtoCultureInspectorV53a = {
    installed:true,
    render,
    getStats: () => ({ installed:true, renders, lineageTraditionView:true, culturalTransmissionSummary:true }),
  };
  document.documentElement.dataset.protoCultureInspectorV53a = 'ready';
}

waitForRuntime().then(install);
