const UPDATE_MS = 1000;

async function waitForRuntime() {
  while (true) {
    const indirect = window.realitySandboxIndirectReciprocityV60;
    const inspector = window.realitySandboxEvolutionInspectorV47b;
    const host = document.getElementById('evolutionInspectorV47bHost');
    if (indirect?.installed && inspector?.installed && host?.shadowRoot) {
      return { indirect, inspector, root:host.shadowRoot };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ indirect, inspector, root }) {
  if (window.realitySandboxIndirectReciprocityInspectorV60a?.installed) return;

  const style = document.createElement('style');
  style.textContent = `
    .indirect-v60 { margin-top:11px; }
    .indirect-v60-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; }
    .indirect-v60-card { padding:8px; border-radius:9px; background:rgba(255,255,255,.038); }
    .indirect-v60-card b { display:block; font-size:13px; }
    .indirect-v60-card span { display:block; margin-top:3px; font-size:8px; text-transform:uppercase; letter-spacing:.06em; opacity:.5; }
    .indirect-v60-list { margin-top:7px; display:grid; gap:4px; }
    .indirect-v60-row { display:grid; grid-template-columns:minmax(0,1fr) auto auto; gap:5px; align-items:center; padding:5px 6px; border-radius:6px; background:rgba(255,255,255,.045); font-size:8px; }
    .indirect-v60-row b { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .indirect-v60-note { margin-top:7px; padding:7px 8px; border-radius:8px; background:rgba(160,210,145,.07); font-size:8px; line-height:1.45; opacity:.72; }
  `;
  root.appendChild(style);

  const anchor = root.querySelector('.reputation-v59') || root.querySelector('.cooperation-v58') || root.querySelector('.social-v57');
  if (!anchor) return;

  const section = document.createElement('div');
  section.className = 'section indirect-v60';
  section.innerHTML = '<div class="section-label">Indirect reciprocity</div><div class="indirect-v60-body"></div>';
  anchor.insertAdjacentElement('afterend', section);

  let renders = 0;
  let last = 0;

  function render() {
    const selected = inspector.getStats?.().selectedLineageId;
    const population = indirect.getPopulationIndirectReciprocity?.() || [];
    const lineage = selected ? population.filter(item => item.lineageId === selected) : [];
    const global = indirect.getStats?.() || {};
    const body = section.querySelector('.indirect-v60-body');

    if (!selected) {
      body.innerHTML = '<div class="empty">Select a lineage to inspect reputation-biased helping.</div>';
      renders++;
      return;
    }

    let reciprocity = 0;
    let sensitivity = 0;
    let biased = 0;
    const rows = [];
    for (const item of lineage) {
      const state = item.indirectReciprocity;
      if (!state) continue;
      reciprocity += Number(state.indirectReciprocity) || 0;
      sensitivity += Number(state.evidenceSensitivity) || 0;
      const choice = state.lastIndirectAidChoice;
      if (choice) {
        biased++;
        rows.push({ id:item.id, ...choice });
      }
    }
    rows.sort((a,b) => (b.step || 0) - (a.step || 0));
    const n = lineage.length || 1;

    body.innerHTML = `
      <div class="indirect-v60-grid">
        <div class="indirect-v60-card"><b>${(reciprocity/n).toFixed(2)}</b><span>indirect reciprocity</span></div>
        <div class="indirect-v60-card"><b>${(sensitivity/n).toFixed(2)}</b><span>evidence sensitivity</span></div>
        <div class="indirect-v60-card"><b>${biased}</b><span>reputation-biased helpers</span></div>
      </div>
      <div class="indirect-v60-list">${rows.length ? rows.slice(0,8).map(row => `
        <div class="indirect-v60-row">
          <b>${row.id} → ${row.requesterId}</b>
          <span>+${(Number(row.adjustment) || 0).toFixed(3)}</span>
          <span>${row.reciprocal ? 'direct+indirect' : 'indirect only'}</span>
        </div>`).join('') : '<span class="empty">No reputation-biased aid choice recorded for this lineage yet.</span>'}
      </div>
      <div class="indirect-v60-note">Global witnessed-reputation score uses ${global.witnessedReputationUses || 0}; indirectly biased aid choices ${global.indirectlyBiasedAidChoices || 0}; completed aid events ${global.indirectlyBiasedAidEvents || 0}. Reputation evidence is observer-local; v58 still owns the physical transfer.</div>`;
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

  window.realitySandboxIndirectReciprocityInspectorV60a = {
    installed:true,
    render,
    getStats:() => ({
      installed:true,
      renders,
      lineageIndirectReciprocityView:true,
      witnessedReputationAdjustmentView:true,
      directVsIndirectView:true,
      conservedTransferBoundaryView:true,
    }),
  };
  document.documentElement.dataset.indirectReciprocityInspectorV60a = 'ready';
}

waitForRuntime().then(install);
