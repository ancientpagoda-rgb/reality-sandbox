const UPDATE_MS = 900;
const ORDER = ['hunt','flee','scavenge','graze','flock','rest','explore'];
const LABEL = { hunt:'Hunt', flee:'Flee', scavenge:'Scavenge', graze:'Graze', flock:'Flock', rest:'Rest', explore:'Explore' };
const pct = v => `${Math.round(Math.max(0, Math.min(1, Number(v) || 0)) * 100)}%`;

async function waitForRuntime() {
  while (true) {
    const brain = window.realitySandboxSensoryBrainsV50;
    const inspector = window.realitySandboxEvolutionInspectorV47b;
    const host = document.getElementById('evolutionInspectorV47bHost');
    if (brain?.installed && inspector?.installed && host?.shadowRoot) return { brain, inspector, root: host.shadowRoot };
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ brain, inspector, root }) {
  if (window.realitySandboxSensoryBrainInspectorV50a?.installed) return;
  const style = document.createElement('style');
  style.textContent = `
    .brain-v50 { margin-top:11px; }
    .brain-v50-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; }
    .brain-v50-card { padding:8px; border-radius:9px; background:rgba(255,255,255,.038); }
    .brain-v50-card b { display:block; font-size:13px; }
    .brain-v50-card span { display:block; margin-top:3px; font-size:8px; text-transform:uppercase; letter-spacing:.06em; opacity:.5; }
    .brain-v50-modes { display:grid; gap:5px; margin-top:7px; }
    .brain-v50-mode { display:grid; grid-template-columns:70px 1fr 35px; align-items:center; gap:6px; }
    .brain-v50-mode > span { font-size:8px; opacity:.66; }
    .brain-v50-bar { height:6px; border-radius:999px; overflow:hidden; background:rgba(255,255,255,.07); }
    .brain-v50-bar i { display:block; height:100%; border-radius:inherit; background:linear-gradient(90deg,#89cfa0,#d5e58c); }
    .brain-v50-pct { text-align:right; font-size:8px !important; }
    .brain-v50-drive { margin-top:7px; font-size:8px; line-height:1.45; opacity:.56; }
  `;
  root.appendChild(style);

  const behavior = root.querySelector('.behavior');
  const behaviorSection = behavior?.closest('.section');
  if (!behaviorSection) return;
  const section = document.createElement('div');
  section.className = 'section brain-v50';
  section.innerHTML = '<div class="section-label">Sensory brain · live decisions</div><div class="brain-v50-body"></div>';
  behaviorSection.insertAdjacentElement('afterend', section);

  let renders = 0;
  let last = 0;

  function render() {
    const selected = inspector.getStats?.().selectedLineageId;
    const all = brain.getPopulationBehaviors?.() || [];
    const members = selected ? all.filter(x => x.lineageId === selected) : [];
    const body = section.querySelector('.brain-v50-body');
    if (!members.length) {
      body.innerHTML = '<div class="empty">No living v50 behavioral records for this lineage.</div>';
      renders++;
      return;
    }
    const counts = Object.fromEntries(ORDER.map(mode => [mode, 0]));
    let reaction = 0, radius = 0, hunger = 0, scarcity = 0;
    const driveTotals = Object.fromEntries(ORDER.map(mode => [mode, 0]));
    for (const member of members) {
      if (counts[member.mode] != null) counts[member.mode]++;
      reaction += Number(member.reactionSpeed) || 0;
      radius += Number(member.senseRadius) || 0;
      hunger += Number(member.hunger) || 0;
      scarcity += Number(member.nutrientScarcity) || 0;
      for (const mode of ORDER) driveTotals[mode] += Number(member.drives?.[mode]) || 0;
    }
    const n = members.length;
    const dominant = ORDER.reduce((best, mode) => counts[mode] > counts[best] ? mode : best, ORDER[0]);
    const maxDrive = Math.max(0.001, ...ORDER.map(mode => driveTotals[mode] / n));
    body.innerHTML = `
      <div class="brain-v50-grid">
        <div class="brain-v50-card"><b>${LABEL[dominant]}</b><span>dominant behavior</span></div>
        <div class="brain-v50-card"><b>${(reaction / n).toFixed(2)}</b><span>reaction speed</span></div>
        <div class="brain-v50-card"><b>${Math.round(radius / n)}</b><span>mean sense radius</span></div>
        <div class="brain-v50-card"><b>${pct(hunger / n)}</b><span>mean hunger</span></div>
      </div>
      <div class="brain-v50-modes">
        ${ORDER.map(mode => {
          const share = counts[mode] / n;
          return `<div class="brain-v50-mode"><span>${LABEL[mode]}</span><span class="brain-v50-bar"><i style="width:${pct(share)}"></i></span><span class="brain-v50-pct">${pct(share)}</span></div>`;
        }).join('')}
      </div>
      <div class="brain-v50-drive">Drive intensity: ${ORDER.map(mode => `${LABEL[mode]} ${(driveTotals[mode] / n / maxDrive).toFixed(2)}`).join(' · ')}<br>Local nutrient scarcity ${pct(scarcity / n)}</div>`;
    renders++;
  }

  const originalSelect = inspector.selectLineage?.bind(inspector);
  if (originalSelect) inspector.selectLineage = id => { const result = originalSelect(id); queueMicrotask(render); return result; };
  const select = root.querySelector('.lineage-select');
  select?.addEventListener('change', () => queueMicrotask(render));

  function loop(now) {
    requestAnimationFrame(loop);
    if (!inspector.isOpen?.() || now - last < UPDATE_MS) return;
    last = now;
    render();
  }
  requestAnimationFrame(loop);
  render();

  window.realitySandboxSensoryBrainInspectorV50a = {
    installed: true,
    render,
    getStats: () => ({ installed:true, renders, liveBehaviorMix:true, selectedLineageAware:true, collapsedInspectorCompatible:true }),
  };
  document.documentElement.dataset.sensoryBrainInspectorV50a = 'ready';
}

waitForRuntime().then(install);
