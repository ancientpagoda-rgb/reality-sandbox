const UPDATE_MS = 1000;

async function waitForRuntime() {
  while (true) {
    const composition = window.realitySandboxCompositionalLanguageV55;
    const inspector = window.realitySandboxEvolutionInspectorV47b;
    const host = document.getElementById('evolutionInspectorV47bHost');
    if (composition?.installed && inspector?.installed && host?.shadowRoot) return { composition, inspector, root:host.shadowRoot };
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ composition, inspector, root }) {
  if (window.realitySandboxCompositionalLanguageInspectorV55a?.installed) return;

  const style = document.createElement('style');
  style.textContent = `
    .composition-v55 { margin-top:11px; }
    .composition-v55-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; }
    .composition-v55-card { padding:8px; border-radius:9px; background:rgba(255,255,255,.038); }
    .composition-v55-card b { display:block; font-size:13px; }
    .composition-v55-card span { display:block; margin-top:3px; font-size:8px; text-transform:uppercase; letter-spacing:.06em; opacity:.5; }
    .composition-v55-note { margin-top:7px; padding:7px 8px; border-radius:8px; background:rgba(132,205,154,.07); font-size:8px; line-height:1.45; opacity:.68; }
    .composition-v55-lexicon { margin-top:7px; display:flex; flex-wrap:wrap; gap:4px; }
    .composition-v55-token { padding:4px 6px; border-radius:6px; background:rgba(255,255,255,.05); font-size:8px; }
  `;
  root.appendChild(style);

  const languageSection = root.querySelector('.language-v54');
  const cultureSection = root.querySelector('.culture-v53');
  const anchor = languageSection || cultureSection || root.querySelector('.behavior')?.closest('.section');
  if (!anchor) return;

  const section = document.createElement('div');
  section.className = 'section composition-v55';
  section.innerHTML = '<div class="section-label">Compositional language</div><div class="composition-v55-body"></div>';
  anchor.insertAdjacentElement('afterend', section);

  let renders = 0;
  let last = 0;

  function render() {
    const selected = inspector.getStats?.().selectedLineageId;
    const population = composition.getPopulationCompositions?.() || [];
    const lineage = selected ? population.filter(item => item.lineageId === selected) : [];
    const stats = composition.getStats?.() || {};
    const body = section.querySelector('.composition-v55-body');

    if (!selected) {
      body.innerHTML = '<div class="empty">Select a lineage to inspect compositional conventions.</div>';
      renders++;
      return;
    }

    const primitiveConventions = new Map();
    const syntaxCounts = new Map();
    let primitiveEntries = 0;
    let interpreting = 0;
    let guiding = 0;
    let capacity = 0;
    let syntaxLearning = 0;

    for (const item of lineage) {
      const state = item.composition;
      if (!state) continue;
      capacity += Number(state.combinatorialCapacity) || 0;
      syntaxLearning += Number(state.syntaxLearning) || 0;
      if (state.interpretedComposition) interpreting++;
      if (state.appliedComposition) guiding++;
      if (state.syntaxOrder && (state.syntaxConfidence || 0) >= 0.24) syntaxCounts.set(state.syntaxOrder, (syntaxCounts.get(state.syntaxOrder) || 0) + 1);
      for (const [token, entry] of Object.entries(state.lexicon || {})) {
        if ((entry.confidence || 0) < 0.24) continue;
        primitiveEntries++;
        const key = `${token}→${entry.primitive}`;
        primitiveConventions.set(key, (primitiveConventions.get(key) || 0) + 1);
      }
    }

    const n = lineage.length || 1;
    const shared = [...primitiveConventions.entries()].sort((a,b) => b[1] - a[1]).slice(0, 8);
    const dominantSyntax = [...syntaxCounts.entries()].sort((a,b) => b[1] - a[1])[0]?.[0] || '—';

    body.innerHTML = `
      <div class="composition-v55-grid">
        <div class="composition-v55-card"><b>${primitiveEntries}</b><span>primitive meanings</span></div>
        <div class="composition-v55-card"><b>${dominantSyntax}</b><span>dominant order</span></div>
        <div class="composition-v55-card"><b>${guiding}</b><span>phrase-guided</span></div>
      </div>
      <div class="composition-v55-lexicon">${shared.length ? shared.map(([key,count]) => `<span class="composition-v55-token">${key} · ${count}</span>`).join('') : '<span class="empty">No shared primitive convention yet.</span>'}</div>
      <div class="composition-v55-note">Interpreting ${interpreting}. Mean combinatorial capacity ${(capacity/n).toFixed(2)} · syntax learning ${(syntaxLearning/n).toFixed(2)}. Global phrases ${stats.phraseEmissions || 0}; successful compositions ${stats.successfulCompositions || 0}; novel compositions ${stats.novelCompositions || 0}; shared syntax ${stats.sharedSyntaxConventions || 0}.</div>`;
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

  window.realitySandboxCompositionalLanguageInspectorV55a = {
    installed:true,
    render,
    getStats:() => ({ installed:true, renders, lineagePrimitiveView:true, learnedSyntaxView:true, liveCompositionView:true, novelCombinationView:true }),
  };
  document.documentElement.dataset.compositionalLanguageInspectorV55a = 'ready';
}

waitForRuntime().then(install);
