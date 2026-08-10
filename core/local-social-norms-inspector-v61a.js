const UPDATE_MS = 1000;

async function waitForRuntime() {
  while (true) {
    const norms = window.realitySandboxLocalSocialNormsV61;
    const inspector = window.realitySandboxEvolutionInspectorV47b;
    const host = document.getElementById('evolutionInspectorV47bHost');
    if (norms?.installed && inspector?.installed && host?.shadowRoot) {
      return { norms, inspector, root:host.shadowRoot };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ norms, inspector, root }) {
  if (window.realitySandboxLocalSocialNormsInspectorV61a?.installed) return;

  const style = document.createElement('style');
  style.textContent = `
    .norms-v61 { margin-top:11px; }
    .norms-v61-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:6px; }
    .norms-v61-card { padding:8px; border-radius:9px; background:rgba(255,255,255,.038); }
    .norms-v61-card b { display:block; font-size:13px; }
    .norms-v61-card span { display:block; margin-top:3px; font-size:8px; text-transform:uppercase; letter-spacing:.06em; opacity:.5; }
    .norms-v61-list { margin-top:7px; display:grid; gap:4px; }
    .norms-v61-row { display:grid; grid-template-columns:minmax(0,1fr) auto auto auto; gap:5px; align-items:center; padding:5px 6px; border-radius:6px; background:rgba(255,255,255,.045); font-size:8px; }
    .norms-v61-row b { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .norms-v61-note { margin-top:7px; padding:7px 8px; border-radius:8px; background:rgba(145,183,228,.07); font-size:8px; line-height:1.45; opacity:.72; }
  `;
  root.appendChild(style);

  const anchor = root.querySelector('.indirect-v60') || root.querySelector('.reputation-v59') || root.querySelector('.cooperation-v58');
  if (!anchor) return;

  const section = document.createElement('div');
  section.className = 'section norms-v61';
  section.innerHTML = '<div class="section-label">Local helping norms</div><div class="norms-v61-body"></div>';
  anchor.insertAdjacentElement('afterend', section);

  let renders = 0;
  let last = 0;

  function render() {
    const selected = inspector.getStats?.().selectedLineageId;
    const population = norms.getPopulationNorms?.() || [];
    const lineage = selected ? population.filter(item => item.lineageId === selected) : [];
    const global = norms.getStats?.() || {};
    const body = section.querySelector('.norms-v61-body');

    if (!selected) {
      body.innerHTML = '<div class="empty">Select a lineage to inspect locally learned helping expectations.</div>';
      renders++;
      return;
    }

    let normSum = 0;
    let evidence = 0;
    let answered = 0;
    let unanswered = 0;
    const rows = [];
    for (const item of lineage) {
      const state = item.norm;
      if (!state) continue;
      normSum += Number(state.helpingNorm) || 0;
      evidence += Number(state.normEvidence) || 0;
      answered += Number(state.answeredObserved) || 0;
      unanswered += Number(state.unansweredObserved) || 0;
      if (state.normEvidence > 0 || state.lastNormScore) rows.push({ id:item.id, ...state });
    }
    rows.sort((a,b) => (b.normEvidence || 0) - (a.normEvidence || 0));
    const n = lineage.length || 1;

    body.innerHTML = `
      <div class="norms-v61-grid">
        <div class="norms-v61-card"><b>${(normSum/n).toFixed(2)}</b><span>helping norm</span></div>
        <div class="norms-v61-card"><b>${evidence}</b><span>local evidence</span></div>
        <div class="norms-v61-card"><b>${answered}</b><span>answered seen</span></div>
        <div class="norms-v61-card"><b>${unanswered}</b><span>unanswered seen</span></div>
      </div>
      <div class="norms-v61-list">${rows.length ? rows.slice(0,8).map(row => `
        <div class="norms-v61-row">
          <b>organism ${row.id}</b>
          <span>norm ${Number(row.helpingNorm || 0).toFixed(2)}</span>
          <span>${row.answeredObserved || 0}✓ / ${row.unansweredObserved || 0}×</span>
          <span>${row.lastNormScore ? signed(row.lastNormScore.adjustment) : 'no choice'}</span>
        </div>`).join('') : '<span class="empty">No local request-outcome evidence recorded yet.</span>'}
      </div>
      <div class="norms-v61-note">Global observed requests ${global.publicRequestsObserved || 0}; answered updates ${global.answeredRequestsLearned || 0}; unanswered updates ${global.unansweredRequestsLearned || 0}; norm-adjusted aid scores ${global.normAdjustedAidScores || 0}. Unanswered events are neighborhood evidence only—no individual refuser is assigned.</div>`;
    renders++;
  }

  function signed(value) {
    const n = Number(value) || 0;
    return `${n >= 0 ? '+' : ''}${n.toFixed(3)}`;
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

  window.realitySandboxLocalSocialNormsInspectorV61a = {
    installed:true,
    render,
    getStats:() => ({
      installed:true,
      renders,
      lineageNormView:true,
      answeredVsUnansweredView:true,
      localEvidenceView:true,
      normConditionedAidView:true,
      noIndividualRefusalBlameView:true,
      conservedAidBoundaryView:true,
    }),
  };
  document.documentElement.dataset.localSocialNormsInspectorV61a = 'ready';
}

waitForRuntime().then(install);
