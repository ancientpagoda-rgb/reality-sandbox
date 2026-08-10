const UPDATE_MS = 1000;

async function waitForRuntime() {
  while (true) {
    const consensus = window.realitySandboxDistributedConsensusV66;
    const inspector = window.realitySandboxEvolutionInspectorV47b;
    const host = document.getElementById('evolutionInspectorV47bHost');
    if (consensus?.installed && inspector?.installed && host?.shadowRoot) {
      return { consensus, inspector, root:host.shadowRoot };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ consensus, inspector, root }) {
  if (window.realitySandboxDistributedConsensusInspectorV66a?.installed) return;

  const style = document.createElement('style');
  style.textContent = `
    .consensus-v66 { margin-top:11px; }
    .consensus-v66-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:6px; }
    .consensus-v66-card { padding:8px; border-radius:9px; background:rgba(255,255,255,.038); }
    .consensus-v66-card b { display:block; font-size:13px; }
    .consensus-v66-card span { display:block; margin-top:3px; font-size:8px; text-transform:uppercase; letter-spacing:.06em; opacity:.5; }
    .consensus-v66-list { margin-top:7px; display:grid; gap:4px; }
    .consensus-v66-row { display:grid; grid-template-columns:minmax(0,1fr) auto auto; gap:5px; align-items:center; padding:5px 6px; border-radius:6px; background:rgba(255,255,255,.045); font-size:8px; }
    .consensus-v66-row b { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .consensus-v66-note { margin-top:7px; padding:7px 8px; border-radius:8px; background:rgba(159,197,224,.07); font-size:8px; line-height:1.45; opacity:.72; }
  `;
  root.appendChild(style);

  const anchor = root.querySelector('.influence-v65') || root.querySelector('.roles-v64') || root.querySelector('.joint-action-v63');
  if (!anchor) return;

  const section = document.createElement('div');
  section.className = 'section consensus-v66';
  section.innerHTML = '<div class="section-label">Distributed local consensus</div><div class="consensus-v66-body"></div>';
  anchor.insertAdjacentElement('afterend', section);

  let renders = 0;
  let last = 0;

  function render() {
    const selected = inspector.getStats?.().selectedLineageId;
    const field = consensus.getDecisionField?.() || { decisions:[], lineages:[] };
    const global = consensus.getStats?.() || {};
    const body = section.querySelector('.consensus-v66-body');

    if (!selected) {
      body.innerHTML = '<div class="empty">Select a lineage to inspect independently derived local decisions.</div>';
      renders++;
      return;
    }

    const lineage = field.lineages.find(item => item.lineageId === selected) || { proposals:[] };
    const decisions = field.decisions.filter(item => item.lineageId === selected);
    const dominant = lineage.proposals[0] || null;
    const split = lineage.proposals.length > 1;
    const meanMargin = decisions.length ? decisions.reduce((sum,item) => sum + (Number(item.margin) || 0), 0) / decisions.length : 0;

    body.innerHTML = `
      <div class="consensus-v66-grid">
        <div class="consensus-v66-card"><b>${decisions.length}</b><span>local decisions</span></div>
        <div class="consensus-v66-card"><b>${dominant?.observers || 0}</b><span>largest alignment</span></div>
        <div class="consensus-v66-card"><b>${split ? 'split' : (dominant ? 'aligned' : 'none')}</b><span>derived field</span></div>
        <div class="consensus-v66-card"><b>${meanMargin.toFixed(2)}</b><span>mean margin</span></div>
      </div>
      <div class="consensus-v66-list">${lineage.proposals.length ? lineage.proposals.slice(0,8).map(proposal =>
        `<div class="consensus-v66-row"><b>${proposal.proposalKey}</b><span>${proposal.observers}</span><span>observers</span></div>`
      ).join('') : '<span class="empty">No current local decisions for this lineage.</span>'}</div>
      <div class="consensus-v66-note">This view aggregates organisms' latest private local decisions on demand. The runtime stores no vote ledger, group decision, government, authority, leader, or membership object. Different listeners can disagree, and the derived alignment can split or reverse as their own outcome histories change.</div>`;
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

  window.realitySandboxDistributedConsensusInspectorV66a = {
    installed:true,
    render,
    getStats:() => ({
      installed:true,
      renders,
      perOrganismDecisionView:true,
      derivedAlignmentView:true,
      splitAndReformView:true,
      decisionMarginView:true,
      physicalConsequenceView:true,
      noGlobalVoteOrAuthorityView:true,
    }),
  };
  document.documentElement.dataset.distributedConsensusInspectorV66a = 'ready';
}

waitForRuntime().then(install);
