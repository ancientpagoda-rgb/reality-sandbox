const UPDATE_MS = 1000;

async function waitForRuntime() {
  while (true) {
    const planning = window.realitySandboxDistributedPlanningV67;
    const inspector = window.realitySandboxEvolutionInspectorV47b;
    const host = document.getElementById('evolutionInspectorV47bHost');
    if (planning?.installed && inspector?.installed && host?.shadowRoot) {
      return { planning, inspector, root:host.shadowRoot };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ planning, inspector, root }) {
  if (window.realitySandboxDistributedPlanningInspectorV67a?.installed) return;

  const style = document.createElement('style');
  style.textContent = `
    .planning-v67 { margin-top:11px; }
    .planning-v67-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:6px; }
    .planning-v67-card { padding:8px; border-radius:9px; background:rgba(255,255,255,.038); }
    .planning-v67-card b { display:block; font-size:13px; }
    .planning-v67-card span { display:block; margin-top:3px; font-size:8px; text-transform:uppercase; letter-spacing:.06em; opacity:.5; }
    .planning-v67-list { margin-top:7px; display:grid; gap:4px; }
    .planning-v67-row { display:grid; grid-template-columns:minmax(0,1fr) auto auto; gap:5px; align-items:center; padding:5px 6px; border-radius:6px; background:rgba(255,255,255,.045); font-size:8px; }
    .planning-v67-row b { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .planning-v67-note { margin-top:7px; padding:7px 8px; border-radius:8px; background:rgba(159,197,224,.07); font-size:8px; line-height:1.45; opacity:.72; }
  `;
  root.appendChild(style);

  const anchor = root.querySelector('.consensus-v66') || root.querySelector('.influence-v65') || root.querySelector('.roles-v64');
  if (!anchor) return;

  const section = document.createElement('div');
  section.className = 'section planning-v67';
  section.innerHTML = '<div class="section-label">Private multi-step planning</div><div class="planning-v67-body"></div>';
  anchor.insertAdjacentElement('afterend', section);

  let renders = 0;
  let last = 0;

  function render() {
    const selected = inspector.getStats?.().selectedLineageId;
    const population = planning.getPopulationPlans?.() || [];
    const global = planning.getStats?.() || {};
    const body = section.querySelector('.planning-v67-body');

    if (!selected) {
      body.innerHTML = '<div class="empty">Select a lineage to inspect private transition memories and prospective actions.</div>';
      renders++;
      return;
    }

    const rows = population.filter(item => item.lineageId === selected);
    const active = rows.filter(item => item.plan?.pendingPlan);
    const formed = rows.filter(item => item.plan?.lastFormedPlan);
    const transitionCount = rows.reduce((sum,item) => sum + Object.keys(item.plan?.transitions || {}).length, 0);
    const applied = rows.filter(item => item.plan?.lastPlanApplication?.applied);

    body.innerHTML = `
      <div class="planning-v67-grid">
        <div class="planning-v67-card"><b>${transitionCount}</b><span>private transitions</span></div>
        <div class="planning-v67-card"><b>${active.length}</b><span>pending forecasts</span></div>
        <div class="planning-v67-card"><b>${formed.length}</b><span>formed forecasts</span></div>
        <div class="planning-v67-card"><b>${applied.length}</b><span>physical executions</span></div>
      </div>
      <div class="planning-v67-list">${formed.length ? formed.slice(0,8).map(item => {
        const plan = item.plan.lastFormedPlan;
        const application = item.plan.lastPlanApplication;
        return `<div class="planning-v67-row"><b>${item.id}: ${plan.fromProposalKey} → ${plan.predictedProposalKey}</b><span>${Number(plan.confidence || 0).toFixed(2)}</span><span>${application?.applied ? 'applied' : 'formed'}</span></div>`;
      }).join('') : '<span class="empty">No private prospective forecasts have formed yet.</span>'}</div>
      <div class="planning-v67-note">Each organism learns only from its own physically supported v66 decision sequence. Forecasts are stored privately and can diverge even among identical genomes. This layer stores no shared plan, group goal, central planner, leader, route authority, or task assignment.</div>`;
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

  window.realitySandboxDistributedPlanningInspectorV67a = {
    installed:true,
    render,
    getStats:() => ({
      installed:true,
      renders,
      privateTransitionMemoryView:true,
      privateForecastView:true,
      divergentPlanView:true,
      physicalExecutionView:true,
      revisionAndDangerOverrideView:true,
      noSharedPlannerStateView:true,
    }),
  };
  document.documentElement.dataset.distributedPlanningInspectorV67a = 'ready';
}

waitForRuntime().then(install);
