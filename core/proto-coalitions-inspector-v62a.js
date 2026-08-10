const UPDATE_MS = 1000;

async function waitForRuntime() {
  while (true) {
    const coalitions = window.realitySandboxProtoCoalitionsV62;
    const inspector = window.realitySandboxEvolutionInspectorV47b;
    const host = document.getElementById('evolutionInspectorV47bHost');
    if (coalitions?.installed && inspector?.installed && host?.shadowRoot) {
      return { coalitions, inspector, root:host.shadowRoot };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ coalitions, inspector, root }) {
  if (window.realitySandboxProtoCoalitionsInspectorV62a?.installed) return;

  const style = document.createElement('style');
  style.textContent = `
    .coalitions-v62 { margin-top:11px; }
    .coalitions-v62-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:6px; }
    .coalitions-v62-card { padding:8px; border-radius:9px; background:rgba(255,255,255,.038); }
    .coalitions-v62-card b { display:block; font-size:13px; }
    .coalitions-v62-card span { display:block; margin-top:3px; font-size:8px; text-transform:uppercase; letter-spacing:.06em; opacity:.5; }
    .coalitions-v62-list { margin-top:7px; display:grid; gap:4px; }
    .coalitions-v62-row { display:grid; grid-template-columns:minmax(0,1fr) auto auto auto; gap:5px; align-items:center; padding:5px 6px; border-radius:6px; background:rgba(255,255,255,.045); font-size:8px; }
    .coalitions-v62-row b { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .coalitions-v62-note { margin-top:7px; padding:7px 8px; border-radius:8px; background:rgba(190,150,225,.07); font-size:8px; line-height:1.45; opacity:.72; }
  `;
  root.appendChild(style);

  const anchor = root.querySelector('.norms-v61') || root.querySelector('.indirect-v60') || root.querySelector('.reputation-v59');
  if (!anchor) return;

  const section = document.createElement('div');
  section.className = 'section coalitions-v62';
  section.innerHTML = '<div class="section-label">Proto-coalitions</div><div class="coalitions-v62-body"></div>';
  anchor.insertAdjacentElement('afterend', section);

  let renders = 0;
  let last = 0;

  function evidenceLabel(entry) {
    const parts = [];
    if ((entry.sourceMask & 1) === 1) parts.push('aid');
    if ((entry.sourceMask & 2) === 2) parts.push('comm');
    if ((entry.sourceMask & 4) === 4) parts.push('witness');
    return parts.join('+') || 'none';
  }

  function render() {
    const selected = inspector.getStats?.().selectedLineageId;
    const population = coalitions.getPopulationAffiliations?.() || [];
    const lineage = selected ? population.filter(item => item.lineageId === selected) : [];
    const graph = coalitions.getCoalitionGraph?.() || { edges:[], components:[] };
    const global = coalitions.getStats?.() || {};
    const body = section.querySelector('.coalitions-v62-body');

    if (!selected) {
      body.innerHTML = '<div class="empty">Select a lineage to inspect mutual affiliation networks.</div>';
      renders++;
      return;
    }

    const ids = new Set(lineage.map(item => item.id));
    const lineageEdges = graph.edges.filter(edge => ids.has(edge.a) && ids.has(edge.b));
    const lineageComponents = graph.components.filter(component => component.members.some(id => ids.has(id)));
    const rows = [];
    for (const item of lineage) {
      for (const entry of Object.values(item.affiliation?.affiliations || {})) {
        rows.push({ observerId:item.id, ...entry });
      }
    }
    rows.sort((a,b) => Math.abs(b.affinity) - Math.abs(a.affinity));

    body.innerHTML = `
      <div class="coalitions-v62-grid">
        <div class="coalitions-v62-card"><b>${lineageEdges.length}</b><span>mutual edges</span></div>
        <div class="coalitions-v62-card"><b>${lineageComponents.length}</b><span>derived components</span></div>
        <div class="coalitions-v62-card"><b>${rows.length}</b><span>bounded affinities</span></div>
        <div class="coalitions-v62-card"><b>${global.coalitionMembers || 0}</b><span>network members</span></div>
      </div>
      <div class="coalitions-v62-list">${rows.length ? rows.slice(0,8).map(row => `
        <div class="coalitions-v62-row">
          <b>${row.observerId} → ${row.partnerId}</b>
          <span>${signed(row.affinity)}</span>
          <span>${evidenceLabel(row)}</span>
          <span>e ${Number(row.evidenceStrength || 0).toFixed(2)}</span>
        </div>`).join('') : '<span class="empty">No partner affiliation evidence recorded yet.</span>'}
      </div>
      <div class="coalitions-v62-note">Coalition structure is reconstructed from mutual strong affiliations only. One-sided affinity remains visible as a directed relationship but creates no stored membership, faction ID, leader, or group state.</div>`;
    renders++;
  }

  function signed(value) {
    const n = Number(value) || 0;
    return `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;
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

  window.realitySandboxProtoCoalitionsInspectorV62a = {
    installed:true,
    render,
    getStats:() => ({
      installed:true,
      renders,
      mutualEdgeView:true,
      derivedComponentView:true,
      oneSidedAffiliationView:true,
      evidenceSourceView:true,
      noStoredMembershipView:true,
    }),
  };
  document.documentElement.dataset.protoCoalitionsInspectorV62a = 'ready';
}

waitForRuntime().then(install);
