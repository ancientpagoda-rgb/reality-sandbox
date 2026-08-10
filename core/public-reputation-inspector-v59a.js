const UPDATE_MS = 1000;

async function waitForRuntime() {
  while (true) {
    const reputation = window.realitySandboxPublicReputationV59;
    const inspector = window.realitySandboxEvolutionInspectorV47b;
    const host = document.getElementById('evolutionInspectorV47bHost');
    if (reputation?.installed && inspector?.installed && host?.shadowRoot) {
      return { reputation, inspector, root:host.shadowRoot };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ reputation, inspector, root }) {
  if (window.realitySandboxPublicReputationInspectorV59a?.installed) return;

  const style = document.createElement('style');
  style.textContent = `
    .reputation-v59 { margin-top:11px; }
    .reputation-v59-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; }
    .reputation-v59-card { padding:8px; border-radius:9px; background:rgba(255,255,255,.038); }
    .reputation-v59-card b { display:block; font-size:13px; }
    .reputation-v59-card span { display:block; margin-top:3px; font-size:8px; text-transform:uppercase; letter-spacing:.06em; opacity:.5; }
    .reputation-v59-list { margin-top:7px; display:grid; gap:4px; }
    .reputation-v59-row { display:grid; grid-template-columns:minmax(0,1fr) auto auto; gap:5px; align-items:center; padding:5px 6px; border-radius:6px; background:rgba(255,255,255,.045); font-size:8px; }
    .reputation-v59-row b { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .reputation-v59-note { margin-top:7px; padding:7px 8px; border-radius:8px; background:rgba(135,190,235,.07); font-size:8px; line-height:1.45; opacity:.72; }
  `;
  root.appendChild(style);

  const cooperationSection = root.querySelector('.cooperation-v58');
  const socialSection = root.querySelector('.social-v57');
  const anchor = cooperationSection || socialSection || root.querySelector('.intent-v56');
  if (!anchor) return;

  const section = document.createElement('div');
  section.className = 'section reputation-v59';
  section.innerHTML = '<div class="section-label">Public reputation</div><div class="reputation-v59-body"></div>';
  anchor.insertAdjacentElement('afterend', section);

  let renders = 0;
  let last = 0;

  function render() {
    const selected = inspector.getStats?.().selectedLineageId;
    const population = reputation.getPopulationReputations?.() || [];
    const lineage = selected ? population.filter(item => item.lineageId === selected) : [];
    const global = reputation.getStats?.() || {};
    const body = section.querySelector('.reputation-v59-body');

    if (!selected) {
      body.innerHTML = '<div class="empty">Select a lineage to inspect locally witnessed reputations.</div>';
      renders++;
      return;
    }

    let entries = 0;
    let witnesses = 0;
    let acuity = 0;
    const aggregate = new Map();
    for (const item of lineage) {
      const state = item.reputation;
      if (!state) continue;
      acuity += Number(state.observationAcuity) || 0;
      if (state.lastWitnessedAid) witnesses++;
      for (const [targetId, entry] of Object.entries(state.reputations || {})) {
        entries++;
        const row = aggregate.get(targetId) || { targetId, prosociality:0, aidWitnesses:0, observers:0 };
        row.prosociality += Number(entry.prosociality) || 0;
        row.aidWitnesses += Number(entry.aidWitnesses) || 0;
        row.observers++;
        aggregate.set(targetId, row);
      }
    }
    const n = lineage.length || 1;
    const rows = [...aggregate.values()]
      .map(row => ({ ...row, prosociality:row.prosociality / Math.max(1, row.observers) }))
      .sort((a,b) => b.aidWitnesses - a.aidWitnesses)
      .slice(0,8);

    body.innerHTML = `
      <div class="reputation-v59-grid">
        <div class="reputation-v59-card"><b>${entries}</b><span>local estimates</span></div>
        <div class="reputation-v59-card"><b>${witnesses}</b><span>recent witnesses</span></div>
        <div class="reputation-v59-card"><b>${(acuity/n).toFixed(2)}</b><span>observation acuity</span></div>
      </div>
      <div class="reputation-v59-list">${rows.length ? rows.map(row => `
        <div class="reputation-v59-row">
          <b>individual ${row.targetId}</b>
          <span>prosocial ${row.prosociality.toFixed(2)}</span>
          <span>${row.aidWitnesses} witnessed aid</span>
        </div>`).join('') : '<span class="empty">No public aid has been witnessed by this lineage yet.</span>'}
      </div>
      <div class="reputation-v59-note">Global public aid events ${global.publicAidEvents || 0}; third-party witnesses ${global.thirdPartyWitnesses || 0}; reputation-biased audience scores ${global.reputationBiasedAudienceScores || 0}. Estimates remain observer-local rather than a shared global score.</div>`;
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

  window.realitySandboxPublicReputationInspectorV59a = {
    installed:true,
    render,
    getStats:() => ({ installed:true, renders, lineageReputationView:true, witnessedAidView:true, observerLocalView:true, disagreementView:true }),
  };
  document.documentElement.dataset.publicReputationInspectorV59a = 'ready';
}

waitForRuntime().then(install);