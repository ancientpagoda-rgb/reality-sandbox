const UPDATE_MS = 1000;

async function waitForRuntime() {
  while (true) {
    const roles = window.realitySandboxRoleDifferentiationV64;
    const inspector = window.realitySandboxEvolutionInspectorV47b;
    const host = document.getElementById('evolutionInspectorV47bHost');
    if (roles?.installed && inspector?.installed && host?.shadowRoot) {
      return { roles, inspector, root:host.shadowRoot };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ roles, inspector, root }) {
  if (window.realitySandboxRoleDifferentiationInspectorV64a?.installed) return;

  const style = document.createElement('style');
  style.textContent = `
    .roles-v64 { margin-top:11px; }
    .roles-v64-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:6px; }
    .roles-v64-card { padding:8px; border-radius:9px; background:rgba(255,255,255,.038); }
    .roles-v64-card b { display:block; font-size:13px; }
    .roles-v64-card span { display:block; margin-top:3px; font-size:8px; text-transform:uppercase; letter-spacing:.06em; opacity:.5; }
    .roles-v64-list { margin-top:7px; display:grid; gap:4px; }
    .roles-v64-row { display:grid; grid-template-columns:minmax(0,1fr) auto auto auto; gap:5px; align-items:center; padding:5px 6px; border-radius:6px; background:rgba(255,255,255,.045); font-size:8px; }
    .roles-v64-row b { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .roles-v64-note { margin-top:7px; padding:7px 8px; border-radius:8px; background:rgba(190,174,232,.07); font-size:8px; line-height:1.45; opacity:.72; }
  `;
  root.appendChild(style);

  const anchor = root.querySelector('.joint-action-v63') || root.querySelector('.coalitions-v62') || root.querySelector('.norms-v61');
  if (!anchor) return;

  const section = document.createElement('div');
  section.className = 'section roles-v64';
  section.innerHTML = '<div class="section-label">Emergent initiative / response tendency</div><div class="roles-v64-body"></div>';
  anchor.insertAdjacentElement('afterend', section);

  let renders = 0;
  let last = 0;

  function render() {
    const selected = inspector.getStats?.().selectedLineageId;
    const population = roles.getPopulationRoles?.() || [];
    const lineage = selected ? population.filter(item => item.lineageId === selected) : [];
    const global = roles.getStats?.() || {};
    const body = section.querySelector('.roles-v64-body');

    if (!selected) {
      body.innerHTML = '<div class="empty">Select a lineage to inspect history-dependent initiative/response differentiation.</div>';
      renders++;
      return;
    }

    const rows = lineage
      .filter(item => item.role?.roleEvidence > 0)
      .sort((a,b) => Math.abs(b.role.initiativeTendency) - Math.abs(a.role.initiativeTendency));
    const mean = lineage.length
      ? lineage.reduce((sum, item) => sum + (Number(item.role?.initiativeTendency) || 0), 0) / lineage.length
      : 0;

    body.innerHTML = `
      <div class="roles-v64-grid">
        <div class="roles-v64-card"><b>${mean.toFixed(2)}</b><span>mean initiative</span></div>
        <div class="roles-v64-card"><b>${global.differentiatedOrganisms || 0}</b><span>differentiated</span></div>
        <div class="roles-v64-card"><b>${global.initiativeLeaningOrganisms || 0}</b><span>initiative-leaning</span></div>
        <div class="roles-v64-card"><b>${global.responseLeaningOrganisms || 0}</b><span>response-leaning</span></div>
      </div>
      <div class="roles-v64-list">${rows.length ? rows.slice(0,8).map(item => {
        const role = item.role;
        const tendency = Number(role.initiativeTendency) || 0;
        const behavior = role.lastCommitmentAdjustment
          ? `persist +${role.lastCommitmentAdjustment.durationAdjustment || 0}`
          : role.lastComplementarityAdjustment
            ? `aud ${signed(role.lastComplementarityAdjustment.adjustment)}`
            : 'learning';
        return `<div class="roles-v64-row"><b>organism ${item.id}</b><span>${signed(tendency)}</span><span>${role.initiations || 0} init / ${role.responses || 0} resp</span><span>${behavior}</span></div>`;
      }).join('') : '<span class="empty">No initiative/response history recorded yet.</span>'}</div>
      <div class="roles-v64-note">These are learned scalar tendencies, not assigned jobs. Initiative evidence comes from the organism's own v56 acts; response evidence comes from its own v63 applications. Complementary partner choice uses only that organism's own v57 partner model, and no leader, rank, role ID, or group assignment is stored.</div>`;
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

  window.realitySandboxRoleDifferentiationInspectorV64a = {
    installed:true,
    render,
    getStats:() => ({
      installed:true,
      renders,
      scalarTendencyView:true,
      ownHistoryEvidenceView:true,
      complementaryAudienceView:true,
      responderPersistenceView:true,
      noAssignedRoleView:true,
      geneticSymmetryBreakingView:true,
    }),
  };
  document.documentElement.dataset.roleDifferentiationInspectorV64a = 'ready';
}

waitForRuntime().then(install);
