const UPDATE_MS = 1000;

async function waitForRuntime() {
  while (true) {
    const jointAction = window.realitySandboxCoalitionJointActionV63;
    const inspector = window.realitySandboxEvolutionInspectorV47b;
    const host = document.getElementById('evolutionInspectorV47bHost');
    if (jointAction?.installed && inspector?.installed && host?.shadowRoot) {
      return { jointAction, inspector, root:host.shadowRoot };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ jointAction, inspector, root }) {
  if (window.realitySandboxCoalitionJointActionInspectorV63a?.installed) return;

  const style = document.createElement('style');
  style.textContent = `
    .joint-action-v63 { margin-top:11px; }
    .joint-action-v63-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:6px; }
    .joint-action-v63-card { padding:8px; border-radius:9px; background:rgba(255,255,255,.038); }
    .joint-action-v63-card b { display:block; font-size:13px; }
    .joint-action-v63-card span { display:block; margin-top:3px; font-size:8px; text-transform:uppercase; letter-spacing:.06em; opacity:.5; }
    .joint-action-v63-list { margin-top:7px; display:grid; gap:4px; }
    .joint-action-v63-row { display:grid; grid-template-columns:minmax(0,1fr) auto auto auto; gap:5px; align-items:center; padding:5px 6px; border-radius:6px; background:rgba(255,255,255,.045); font-size:8px; }
    .joint-action-v63-row b { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .joint-action-v63-note { margin-top:7px; padding:7px 8px; border-radius:8px; background:rgba(142,205,182,.07); font-size:8px; line-height:1.45; opacity:.72; }
  `;
  root.appendChild(style);

  const anchor = root.querySelector('.coalitions-v62') || root.querySelector('.norms-v61') || root.querySelector('.indirect-v60');
  if (!anchor) return;

  const section = document.createElement('div');
  section.className = 'section joint-action-v63';
  section.innerHTML = '<div class="section-label">Affiliate joint action</div><div class="joint-action-v63-body"></div>';
  anchor.insertAdjacentElement('afterend', section);

  let renders = 0;
  let last = 0;

  function render() {
    const selected = inspector.getStats?.().selectedLineageId;
    const population = jointAction.getPopulationJointAction?.() || [];
    const lineage = selected ? population.filter(item => item.lineageId === selected) : [];
    const global = jointAction.getStats?.() || {};
    const body = section.querySelector('.joint-action-v63-body');

    if (!selected) {
      body.innerHTML = '<div class="empty">Select a lineage to inspect affiliation-conditioned response persistence.</div>';
      renders++;
      return;
    }

    let active = 0;
    let applied = 0;
    let interrupted = 0;
    let positiveDelta = 0;
    const rows = [];
    for (const item of lineage) {
      const state = item.jointAction;
      if (!state) continue;
      if (state.commitment) active++;
      if (state.lastAppliedCommitment) {
        if (state.lastAppliedCommitment.interrupted) interrupted++;
        else {
          applied++;
          positiveDelta += Math.max(0, Number(state.lastAppliedCommitment.directionalVelocityDelta) || 0);
        }
      }
      if (state.commitment || state.lastAppliedCommitment) rows.push({ id:item.id, ...state });
    }
    rows.sort((a,b) => Number(Boolean(b.commitment)) - Number(Boolean(a.commitment)) || (b.commitment?.strength || 0) - (a.commitment?.strength || 0));

    body.innerHTML = `
      <div class="joint-action-v63-grid">
        <div class="joint-action-v63-card"><b>${active}</b><span>active commitments</span></div>
        <div class="joint-action-v63-card"><b>${applied}</b><span>recent applied</span></div>
        <div class="joint-action-v63-card"><b>${interrupted}</b><span>danger overrides</span></div>
        <div class="joint-action-v63-card"><b>${positiveDelta.toFixed(2)}</b><span>+ directional Δv</span></div>
      </div>
      <div class="joint-action-v63-list">${rows.length ? rows.slice(0,8).map(row => {
        const current = row.commitment;
        const lastApplied = row.lastAppliedCommitment;
        const status = current ? `→ ${current.speakerId}` : lastApplied?.interrupted ? 'danger override' : 'recent response';
        const remain = current ? `${current.remainingSteps}/${current.totalSteps}` : '—';
        const delta = !lastApplied?.interrupted && Number.isFinite(lastApplied?.directionalVelocityDelta)
          ? signed(lastApplied.directionalVelocityDelta)
          : '—';
        return `<div class="joint-action-v63-row"><b>organism ${row.id}</b><span>${status}</span><span>${remain}</span><span>Δv ${delta}</span></div>`;
      }).join('') : '<span class="empty">No affiliation-conditioned joint response recorded yet.</span>'}</div>
      <div class="joint-action-v63-note">v63 persists only an already-observed v56 gesture using the listener's own v62 affiliation. There is no group command, reverse-affiliation lookup, shared target coordinate, or stored coalition membership. Sensed danger interrupts the bounded commitment.</div>`;
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

  window.realitySandboxCoalitionJointActionInspectorV63a = {
    installed:true,
    render,
    getStats:() => ({
      installed:true,
      renders,
      activeCommitmentView:true,
      directionalContributionView:true,
      ownAffiliationBoundaryView:true,
      urgentDangerOverrideView:true,
      noGroupCommandView:true,
      boundedPersistenceView:true,
    }),
  };
  document.documentElement.dataset.coalitionJointActionInspectorV63a = 'ready';
}

waitForRuntime().then(install);
