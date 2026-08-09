const UPDATE_MS = 1000;

async function waitForRuntime() {
  while (true) {
    const memory = window.realitySandboxLearningMemoryV52;
    const inspector = window.realitySandboxEvolutionInspectorV47b;
    const host = document.getElementById('evolutionInspectorV47bHost');
    if (memory?.installed && inspector?.installed && host?.shadowRoot) return { memory, inspector, root: host.shadowRoot };
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ memory, inspector, root }) {
  if (window.realitySandboxLearningMemoryInspectorV52a?.installed) return;
  const style = document.createElement('style');
  style.textContent = `
    .memory-v52 { margin-top:11px; }
    .memory-v52-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; }
    .memory-v52-card { padding:8px; border-radius:9px; background:rgba(255,255,255,.038); }
    .memory-v52-card b { display:block; font-size:13px; }
    .memory-v52-card span { display:block; margin-top:3px; font-size:8px; text-transform:uppercase; letter-spacing:.06em; opacity:.5; }
    .memory-v52-note { margin-top:7px; padding:7px 8px; border-radius:8px; background:rgba(132,205,154,.07); font-size:8px; line-height:1.45; opacity:.65; }
  `;
  root.appendChild(style);

  const socialSection = root.querySelector('.social-v51');
  const brainSection = root.querySelector('.brain-v50');
  const anchor = socialSection || brainSection || root.querySelector('.behavior')?.closest('.section');
  if (!anchor) return;

  const section = document.createElement('div');
  section.className = 'section memory-v52';
  section.innerHTML = '<div class="section-label">Learning & memory</div><div class="memory-v52-body"></div>';
  anchor.insertAdjacentElement('afterend', section);

  let renders = 0;
  let last = 0;

  function render() {
    const selected = inspector.getStats?.().selectedLineageId;
    const entries = memory.getPopulationMemories?.() || [];
    const lineage = selected ? entries.filter(item => item.lineageId === selected) : [];
    const stats = memory.getStats?.() || {};
    const body = section.querySelector('.memory-v52-body');
    if (!selected) {
      body.innerHTML = '<div class="empty">Select a lineage to inspect learned memory.</div>';
      renders++;
      return;
    }

    let food = 0, danger = 0, hunt = 0, recalling = 0, learning = 0, retention = 0;
    const recallModes = {};
    for (const item of lineage) {
      const m = item.memory;
      if (!m) continue;
      if (m.memories.food) food++;
      if (m.memories.danger) danger++;
      if (m.memories.hunt) hunt++;
      if (m.recalledAction) {
        recalling++;
        recallModes[m.recalledAction] = (recallModes[m.recalledAction] || 0) + 1;
      }
      learning += Number(m.learningRate) || 0;
      retention += Number(m.retention) || 0;
    }
    const n = lineage.length || 1;
    const dominantRecall = Object.entries(recallModes).sort((a,b) => b[1] - a[1])[0]?.[0] || 'none';
    body.innerHTML = `
      <div class="memory-v52-grid">
        <div class="memory-v52-card"><b>${food}</b><span>food memories</span></div>
        <div class="memory-v52-card"><b>${danger}</b><span>danger memories</span></div>
        <div class="memory-v52-card"><b>${hunt}</b><span>hunt memories</span></div>
      </div>
      <div class="memory-v52-note">Recall active: ${recalling}/${lineage.length}. Dominant recall: ${dominantRecall}. Mean learning ${(learning / n).toFixed(2)} · retention ${(retention / n).toFixed(2)}. Global active memories: ${stats.activeMemories || 0}; reinforced: ${stats.memoriesReinforced || 0}.</div>`;
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

  window.realitySandboxLearningMemoryInspectorV52a = {
    installed:true,
    render,
    getStats: () => ({ installed:true, renders, lineageMemoryView:true, recallSummary:true }),
  };
  document.documentElement.dataset.learningMemoryInspectorV52a = 'ready';
}

waitForRuntime().then(install);
