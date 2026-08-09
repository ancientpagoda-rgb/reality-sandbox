const UPDATE_MS = 850;
const ACTION_LABELS = { forage:'Forage', hunt:'Hunt', flee:'Flee', flock:'Flock', rest:'Rest', explore:'Explore' };
const SENSOR_LABELS = { energyLow:'low energy', foodScarcity:'food scarcity', preyOpportunity:'prey opportunity', threat:'threat', kinDensity:'kin density', sleepDebt:'sleep debt', soilToxin:'soil toxin', habitatStress:'habitat stress' };
const pct = value => `${Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100)}%`;

async function waitForRuntime() {
  while (true) {
    const brains = window.realitySandboxEvolvingBrainsV50;
    const inspector = window.realitySandboxEvolutionInspectorV47b;
    const host = document.getElementById('evolutionInspectorV47bHost');
    if (brains?.installed && inspector?.installed && host?.shadowRoot) return { brains, inspector, root: host.shadowRoot };
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ brains, inspector, root }) {
  if (window.realitySandboxBrainInspectorV50a?.installed) return;
  const style = document.createElement('style');
  style.textContent = `
    .brain-v50a { margin-top:11px; padding:9px; border-radius:9px; background:rgba(255,255,255,.035); }
    .brain-v50a h3 { margin:0 0 7px; font-size:9px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; opacity:.58; }
    .brain-summary-v50a { display:grid; grid-template-columns:repeat(3,1fr); gap:5px; margin-bottom:7px; }
    .brain-summary-v50a div,.brain-actions-v50a div { padding:6px; border-radius:7px; background:rgba(255,255,255,.035); min-width:0; }
    .brain-summary-v50a b,.brain-actions-v50a b { display:block; font-size:10px; line-height:1.15; }
    .brain-summary-v50a span,.brain-actions-v50a span { display:block; margin-top:2px; font-size:7px; opacity:.48; text-transform:uppercase; }
    .brain-actions-v50a { display:grid; grid-template-columns:repeat(6,1fr); gap:4px; margin-bottom:8px; }
    .brain-actions-v50a div { text-align:center; padding:5px 3px; }
    .brain-wires-v50a { display:grid; gap:5px; }
    .brain-wire-v50a { display:grid; grid-template-columns:55px 1fr; gap:7px; align-items:start; padding:6px; border-radius:7px; background:rgba(255,255,255,.025); }
    .brain-wire-v50a > b { font-size:8px; text-transform:uppercase; opacity:.72; }
    .brain-wire-v50a .links { font-size:8px; line-height:1.4; opacity:.62; }
    .brain-wire-v50a .positive { color:#ccebd4; }
    .brain-wire-v50a .negative { color:#e8c4c4; }
    .brain-empty-v50a { padding:8px; border-radius:7px; background:rgba(255,255,255,.025); font-size:9px; opacity:.55; }
    @media (max-width:620px) { .brain-actions-v50a { grid-template-columns:repeat(3,1fr); } }
  `;
  root.appendChild(style);
  const bodyHistory = root.querySelector('.body-history-v48c');
  const box = document.createElement('div');
  box.className = 'brain-v50a';
  box.innerHTML = '<h3>Evolving brain · v50</h3><div class="brain-summary-v50a"></div><div class="brain-actions-v50a"></div><div class="brain-wires-v50a"></div>';
  if (bodyHistory) bodyHistory.insertAdjacentElement('afterend', box); else root.querySelector('.body-plan-v48')?.insertAdjacentElement('afterend', box);
  let renders = 0, lastSelected = null;

  function strongestLinks(brain, action) {
    const ranked = Object.entries(brain?.weights?.[action] || {}).sort((a,b) => Math.abs(b[1]) - Math.abs(a[1]));
    return { positive: ranked.find(([,v]) => v > 0.02) || null, negative: ranked.find(([,v]) => v < -0.02) || null };
  }
  function render() {
    const selected = inspector.getStats?.().selectedLineageId;
    const lineage = selected ? (brains.getLineageBrains?.() || []).find(item => item.lineageId === selected) : null;
    const summary = box.querySelector('.brain-summary-v50a'), actions = box.querySelector('.brain-actions-v50a'), wires = box.querySelector('.brain-wires-v50a');
    if (!summary || !actions || !wires) return;
    if (!lineage?.brain) {
      summary.innerHTML = ''; actions.innerHTML = ''; wires.innerHTML = '<div class="brain-empty-v50a">No living motile brain is available for this lineage.</div>';
      lastSelected = selected || null; renders++; return;
    }
    const brain = lineage.brain;
    summary.innerHTML = [[lineage.population,'brains sampled'],[pct(brain.memoryStrength),'action memory'],[pct(brain.decisionRate),'decision rate'],[pct(brain.inhibition),'inhibition'],[brains.sensors.length,'sensors'],[brains.actions.length,'actions']].map(([v,l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
    const total = Object.values(lineage.currentActions || {}).reduce((s,v)=>s+(Number(v)||0),0) || 1;
    actions.innerHTML = brains.actions.map(action => `<div><b>${Math.round(((Number(lineage.currentActions?.[action])||0)/total)*100)}%</b><span>${ACTION_LABELS[action]||action}</span></div>`).join('');
    wires.innerHTML = brains.actions.map(action => {
      const links = strongestLinks(brain, action);
      const positive = links.positive ? `<span class="positive">+ ${SENSOR_LABELS[links.positive[0]]||links.positive[0]} ${Number(links.positive[1]).toFixed(2)}</span>` : '<span>no strong excitation</span>';
      const negative = links.negative ? `<span class="negative">− ${SENSOR_LABELS[links.negative[0]]||links.negative[0]} ${Math.abs(Number(links.negative[1])).toFixed(2)}</span>` : '<span>no strong inhibition</span>';
      return `<div class="brain-wire-v50a"><b>${ACTION_LABELS[action]||action}</b><div class="links">bias ${Number(brain.bias?.[action]||0).toFixed(2)} · ${positive} · ${negative}</div></div>`;
    }).join('');
    lastSelected = selected || null; renders++;
  }
  root.querySelector('.lineage-select')?.addEventListener('change', () => queueMicrotask(render));
  let last = -Infinity;
  function loop(now) { requestAnimationFrame(loop); if (!inspector.isOpen?.() || now-last<UPDATE_MS) return; last=now; render(); }
  requestAnimationFrame(loop);
  const api = { installed:true, render, getStats:()=>({ installed:true, renders, selectedLineageId:lastSelected, actionDistribution:true, sensorActionWeights:true, strongestConnectionView:true, surfaceRendererTouched:false }) };
  window.realitySandboxBrainInspectorV50a = api;
  document.documentElement.dataset.brainInspectorV50a = 'sensor-action-lineage-view';
}

waitForRuntime().then(install);