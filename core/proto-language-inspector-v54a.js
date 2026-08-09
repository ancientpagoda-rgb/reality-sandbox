const UPDATE_MS = 1000;

async function waitForRuntime() {
  while (true) {
    const language = window.realitySandboxProtoLanguageV54;
    const inspector = window.realitySandboxEvolutionInspectorV47b;
    const host = document.getElementById('evolutionInspectorV47bHost');
    if (language?.installed && inspector?.installed && host?.shadowRoot) return { language, inspector, root:host.shadowRoot };
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ language, inspector, root }) {
  if (window.realitySandboxProtoLanguageInspectorV54a?.installed) return;
  const style = document.createElement('style');
  style.textContent = `
    .language-v54 { margin-top:11px; }
    .language-v54-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; }
    .language-v54-card { padding:8px; border-radius:9px; background:rgba(255,255,255,.038); }
    .language-v54-card b { display:block; font-size:13px; }
    .language-v54-card span { display:block; margin-top:3px; font-size:8px; text-transform:uppercase; letter-spacing:.06em; opacity:.5; }
    .language-v54-note { margin-top:7px; padding:7px 8px; border-radius:8px; background:rgba(132,205,154,.07); font-size:8px; line-height:1.45; opacity:.65; }
    .language-v54-lexicon { margin-top:7px; display:flex; flex-wrap:wrap; gap:4px; }
    .language-v54-token { padding:4px 6px; border-radius:6px; background:rgba(255,255,255,.05); font-size:8px; }
  `;
  root.appendChild(style);

  const cultureSection = root.querySelector('.culture-v53');
  const memorySection = root.querySelector('.memory-v52');
  const anchor = cultureSection || memorySection || root.querySelector('.behavior')?.closest('.section');
  if (!anchor) return;

  const section = document.createElement('div');
  section.className = 'section language-v54';
  section.innerHTML = '<div class="section-label">Proto-language</div><div class="language-v54-body"></div>';
  anchor.insertAdjacentElement('afterend', section);

  let renders = 0;
  let last = 0;

  function render() {
    const selected = inspector.getStats?.().selectedLineageId;
    const entries = language.getPopulationLanguage?.() || [];
    const lineage = selected ? entries.filter(item => item.lineageId === selected) : [];
    const stats = language.getStats?.() || {};
    const body = section.querySelector('.language-v54-body');
    if (!selected) {
      body.innerHTML = '<div class="empty">Select a lineage to inspect learned symbols.</div>';
      renders++;
      return;
    }

    const conventions = new Map();
    let lexiconEntries = 0;
    let interpreted = 0;
    let guiding = 0;
    let vocality = 0;
    let receptivity = 0;
    for (const item of lineage) {
      const lang = item.language;
      if (!lang) continue;
      vocality += Number(lang.vocality) || 0;
      receptivity += Number(lang.receptivity) || 0;
      if (lang.interpretedMeaning) interpreted++;
      if (lang.appliedLanguageAction) guiding++;
      for (const [token, entry] of Object.entries(lang.lexicon || {})) {
        if ((entry.confidence || 0) < 0.24) continue;
        lexiconEntries++;
        const key = `${token}→${entry.meaning}`;
        conventions.set(key, (conventions.get(key) || 0) + 1);
      }
    }
    const n = lineage.length || 1;
    const shared = [...conventions.entries()].sort((a,b) => b[1] - a[1]).slice(0, 6);
    body.innerHTML = `
      <div class="language-v54-grid">
        <div class="language-v54-card"><b>${lexiconEntries}</b><span>known symbols</span></div>
        <div class="language-v54-card"><b>${interpreted}</b><span>interpreting now</span></div>
        <div class="language-v54-card"><b>${guiding}</b><span>symbol-guided</span></div>
      </div>
      <div class="language-v54-lexicon">${shared.length ? shared.map(([key,count]) => `<span class="language-v54-token">${key} · ${count}</span>`).join('') : '<span class="empty">No shared convention yet.</span>'}</div>
      <div class="language-v54-note">Mean vocality ${(vocality/n).toFixed(2)} · receptivity ${(receptivity/n).toFixed(2)}. Global emissions ${stats.symbolEmissions || 0}; learned associations ${stats.associationsLearned || 0}; shared conventions ${stats.sharedConventions || 0}.</div>`;
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

  window.realitySandboxProtoLanguageInspectorV54a = {
    installed:true,
    render,
    getStats:() => ({ installed:true, renders, lineageLexiconView:true, sharedConventionView:true, liveInterpretationView:true }),
  };
  document.documentElement.dataset.protoLanguageInspectorV54a = 'ready';
}

waitForRuntime().then(install);
