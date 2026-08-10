const UPDATE_MS = 1000;

async function waitForRuntime() {
  while (true) {
    const cooperation = window.realitySandboxReciprocalCooperationV58;
    const inspector = window.realitySandboxEvolutionInspectorV47b;
    const host = document.getElementById('evolutionInspectorV47bHost');
    if (cooperation?.installed && inspector?.installed && host?.shadowRoot) {
      return { cooperation, inspector, root:host.shadowRoot };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ cooperation, inspector, root }) {
  if (window.realitySandboxReciprocalCooperationInspectorV58a?.installed) return;

  const style = document.createElement('style');
  style.textContent = `
    .cooperation-v58 { margin-top:11px; }
    .cooperation-v58-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; }
    .cooperation-v58-card { padding:8px; border-radius:9px; background:rgba(255,255,255,.038); }
    .cooperation-v58-card b { display:block; font-size:13px; }
    .cooperation-v58-card span { display:block; margin-top:3px; font-size:8px; text-transform:uppercase; letter-spacing:.06em; opacity:.5; }
    .cooperation-v58-list { margin-top:7px; display:grid; gap:4px; }
    .cooperation-v58-row { display:grid; grid-template-columns:minmax(0,1fr) auto auto auto; gap:5px; align-items:center; padding:5px 6px; border-radius:6px; background:rgba(255,255,255,.045); font-size:8px; }
    .cooperation-v58-row b { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .cooperation-v58-note { margin-top:7px; padding:7px 8px; border-radius:8px; background:rgba(225,194,118,.07); font-size:8px; line-height:1.45; opacity:.72; }
  `;
  root.appendChild(style);

  const socialSection = root.querySelector('.social-v57');
  const intentSection = root.querySelector('.intent-v56');
  const anchor = socialSection || intentSection || root.querySelector('.composition-v55');
  if (!anchor) return;

  const section = document.createElement('div');
  section.className = 'section cooperation-v58';
  section.innerHTML = '<div class="section-label">Reciprocal aid</div><div class="cooperation-v58-body"></div>';
  anchor.insertAdjacentElement('afterend', section);

  let renders = 0;
  let last = 0;

  function render() {
    const selected = inspector.getStats?.().selectedLineageId;
    const population = cooperation.getPopulationCooperation?.() || [];
    const lineage = selected ? population.filter(item => item.lineageId === selected) : [];
    const global = cooperation.getStats?.() || {};
    const body = section.querySelector('.cooperation-v58-body');

    if (!selected) {
      body.innerHTML = '<div class="empty">Select a lineage to inspect reciprocal aid.</div>';
      renders++;
      return;
    }

    let ledgerCount = 0;
    let helping = 0;
    let learning = 0;
    let solicitations = 0;
    const aggregate = new Map();

    for (const item of lineage) {
      const state = item.cooperation;
      if (!state) continue;
      helping += Number(state.helpingTendency) || 0;
      learning += Number(state.reciprocityLearning) || 0;
      if (state.lastSolicitation) solicitations++;
      for (const [partnerId, ledger] of Object.entries(state.ledgers || {})) {
        ledgerCount++;
        const row = aggregate.get(partnerId) || { given:0, received:0, giftsGiven:0, giftsReceived:0, reciprocity:0, observers:0 };
        row.given += Number(ledger.given) || 0;
        row.received += Number(ledger.received) || 0;
        row.giftsGiven += Number(ledger.giftsGiven) || 0;
        row.giftsReceived += Number(ledger.giftsReceived) || 0;
        row.reciprocity += Number(ledger.reciprocity) || 0;
        row.observers++;
        aggregate.set(partnerId, row);
      }
    }

    const n = lineage.length || 1;
    const rows = [...aggregate.entries()]
      .map(([partnerId, row]) => ({ ...row, partnerId, reciprocity:row.reciprocity / Math.max(1, row.observers) }))
      .sort((a,b) => (b.giftsGiven + b.giftsReceived) - (a.giftsGiven + a.giftsReceived))
      .slice(0,8);

    body.innerHTML = `
      <div class="cooperation-v58-grid">
        <div class="cooperation-v58-card"><b>${ledgerCount}</b><span>aid relationships</span></div>
        <div class="cooperation-v58-card"><b>${solicitations}</b><span>recent requests</span></div>
        <div class="cooperation-v58-card"><b>${(helping/n).toFixed(2)}</b><span>help tendency</span></div>
      </div>
      <div class="cooperation-v58-list">${rows.length ? rows.map(row => `
        <div class="cooperation-v58-row">
          <b>partner ${row.partnerId}</b>
          <span>gave ${row.given.toFixed(2)}</span>
          <span>got ${row.received.toFixed(2)}</span>
          <span>recip ${signed(row.reciprocity)}</span>
        </div>`).join('') : '<span class="empty">No aid exchanges recorded yet.</span>'}
      </div>
      <div class="cooperation-v58-note">
        Reciprocity learning ${(learning/n).toFixed(2)}. Global solicitations ${global.solicitations || 0}; aid events ${global.aidEvents || 0}; reciprocal choices ${global.reciprocalChoices || 0}; energy moved ${(global.energyReceived || 0).toFixed(2)} with ${(global.metabolicAidCost || 0).toFixed(2)} transfer cost.
      </div>`;
    renders++;
  }

  function signed(value) {
    const n = Number(value) || 0;
    return `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;
  }

  const originalSelect = inspector.selectLineage?.bind(inspector);
  if (originalSelect) {
    inspector.selectLineage = id => {
      const result = originalSelect(id);
      queueMicrotask(render);
      return result;
    };
  }
  root.querySelector('.lineage-select')?.addEventListener('change', () => queueMicrotask(render));

  function loop(now) {
    requestAnimationFrame(loop);
    if (!inspector.isOpen?.() || now - last < UPDATE_MS) return;
    last = now;
    render();
  }
  requestAnimationFrame(loop);
  render();

  window.realitySandboxReciprocalCooperationInspectorV58a = {
    installed:true,
    render,
    getStats:() => ({
      installed:true,
      renders,
      lineageAidView:true,
      reciprocalLedgerView:true,
      conservationView:true,
      solicitationView:true,
      costlyHelpingView:true,
    }),
  };
  document.documentElement.dataset.reciprocalCooperationInspectorV58a = 'ready';
}

waitForRuntime().then(install);
