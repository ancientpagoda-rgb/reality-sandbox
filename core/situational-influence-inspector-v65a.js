const UPDATE_MS = 1000;

async function waitForRuntime() {
  while (true) {
    const influence = window.realitySandboxSituationalInfluenceV65;
    const inspector = window.realitySandboxEvolutionInspectorV47b;
    const host = document.getElementById('evolutionInspectorV47bHost');
    if (influence?.installed && inspector?.installed && host?.shadowRoot) {
      return { influence, inspector, root:host.shadowRoot };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ influence, inspector, root }) {
  if (window.realitySandboxSituationalInfluenceInspectorV65a?.installed) return;

  const style = document.createElement('style');
  style.textContent = `
    .influence-v65 { margin-top:11px; }
    .influence-v65-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:6px; }
    .influence-v65-card { padding:8px; border-radius:9px; background:rgba(255,255,255,.038); }
    .influence-v65-card b { display:block; font-size:13px; }
    .influence-v65-card span { display:block; margin-top:3px; font-size:8px; text-transform:uppercase; letter-spacing:.06em; opacity:.5; }
    .influence-v65-list { margin-top:7px; display:grid; gap:4px; }
    .influence-v65-row { display:grid; grid-template-columns:minmax(0,1fr) auto auto; gap:5px; align-items:center; padding:5px 6px; border-radius:6px; background:rgba(255,255,255,.045); font-size:8px; }
    .influence-v65-row b { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .influence-v65-note { margin-top:7px; padding:7px 8px; border-radius:8px; background:rgba(159,197,224,.07); font-size:8px; line-height:1.45; opacity:.72; }
  `;
  root.appendChild(style);

  const anchor = root.querySelector('.roles-v64') || root.querySelector('.joint-action-v63') || root.querySelector('.coalitions-v62');
  if (!anchor) return;

  const section = document.createElement('div');
  section.className = 'section influence-v65';
  section.innerHTML = '<div class="section-label">Derived situational influence</div><div class="influence-v65-body"></div>';
  anchor.insertAdjacentElement('afterend', section);

  let renders = 0;
  let last = 0;

  function render() {
    const selected = inspector.getStats?.().selectedLineageId;
    const population = influence.getPopulationInfluence?.() || [];
    const ids = new Set(selected ? population.filter(item => item.lineageId === selected).map(item => item.id) : []);
    const graph = influence.getInfluenceGraph?.() || { edges:[], incoming:[] };
    const global = influence.getStats?.() || {};
    const body = section.querySelector('.influence-v65-body');

    if (!selected) {
      body.innerHTML = '<div class="empty">Select a lineage to inspect outcome-derived, reversible influence.</div>';
      renders++;
      return;
    }

    const edges = graph.edges
      .filter(edge => ids.has(edge.observerId) && ids.has(edge.speakerId))
      .sort((a,b) => b.strength - a.strength);
    const incoming = graph.incoming
      .filter(item => ids.has(item.speakerId))
      .sort((a,b) => b.observers - a.observers || b.strength - a.strength);
    const strongest = incoming[0] || null;

    body.innerHTML = `
      <div class="influence-v65-grid">
        <div class="influence-v65-card"><b>${edges.length}</b><span>derived edges</span></div>
        <div class="influence-v65-card"><b>${strongest?.observers || 0}</b><span>max observers</span></div>
        <div class="influence-v65-card"><b>${global.concentratedInfluencers || 0}</b><span>concentrated</span></div>
        <div class="influence-v65-card"><b>${Number(global.meanPositiveInfluence || 0).toFixed(2)}</b><span>mean influence</span></div>
      </div>
      <div class="influence-v65-list">${edges.length ? edges.slice(0,8).map(edge =>
        `<div class="influence-v65-row"><b>${edge.observerId} → ${edge.speakerId}</b><span>${Number(edge.strength || 0).toFixed(2)}</span><span>own outcomes</span></div>`
      ).join('') : '<span class="empty">No positive influence edges currently exceed the local threshold.</span>'}</div>
      <div class="influence-v65-note">Edges are derived on demand from each observer's own communication outcomes and response history. Multiple observers may independently converge on the same signaler, but no leader, rank, office, authority, or membership object is stored. If an observer's outcomes change, its edge can move independently.</div>`;
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

  window.realitySandboxSituationalInfluenceInspectorV65a = {
    installed:true,
    render,
    getStats:() => ({
      installed:true,
      renders,
      derivedEdgeView:true,
      independentConvergenceView:true,
      reversibleInfluenceView:true,
      ownOutcomeEvidenceView:true,
      boundedCommitmentConsequenceView:true,
      noLeaderStateView:true,
    }),
  };
  document.documentElement.dataset.situationalInfluenceInspectorV65a = 'ready';
}

waitForRuntime().then(install);
