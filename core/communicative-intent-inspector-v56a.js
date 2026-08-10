const UPDATE_MS = 1000;

async function waitForRuntime() {
  while (true) {
    const intent = window.realitySandboxCommunicativeIntentV56;
    const inspector = window.realitySandboxEvolutionInspectorV47b;
    const host = document.getElementById('evolutionInspectorV47bHost');
    if (intent?.installed && inspector?.installed && host?.shadowRoot) return { intent, inspector, root:host.shadowRoot };
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ intent, inspector, root }) {
  if (window.realitySandboxCommunicativeIntentInspectorV56a?.installed) return;

  const style = document.createElement('style');
  style.textContent = `
    .intent-v56 { margin-top:11px; }
    .intent-v56-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; }
    .intent-v56-card { padding:8px; border-radius:9px; background:rgba(255,255,255,.038); }
    .intent-v56-card b { display:block; font-size:13px; }
    .intent-v56-card span { display:block; margin-top:3px; font-size:8px; text-transform:uppercase; letter-spacing:.06em; opacity:.5; }
    .intent-v56-note { margin-top:7px; padding:7px 8px; border-radius:8px; background:rgba(132,205,154,.07); font-size:8px; line-height:1.45; opacity:.68; }
    .intent-v56-pairs { margin-top:7px; display:flex; flex-wrap:wrap; gap:4px; }
    .intent-v56-pair { padding:4px 6px; border-radius:6px; background:rgba(255,255,255,.05); font-size:8px; }
  `;
  root.appendChild(style);

  const compositionSection = root.querySelector('.composition-v55');
  const languageSection = root.querySelector('.language-v54');
  const anchor = compositionSection || languageSection || root.querySelector('.culture-v53') || root.querySelector('.behavior')?.closest('.section');
  if (!anchor) return;

  const section = document.createElement('div');
  section.className = 'section intent-v56';
  section.innerHTML = '<div class="section-label">Communicative intent</div><div class="intent-v56-body"></div>';
  anchor.insertAdjacentElement('afterend', section);

  let renders = 0;
  let last = 0;

  function render() {
    const selected = inspector.getStats?.().selectedLineageId;
    const population = intent.getPopulationIntent?.() || [];
    const lineage = selected ? population.filter(item => item.lineageId === selected) : [];
    const stats = intent.getStats?.() || {};
    const body = section.querySelector('.intent-v56-body');

    if (!selected) {
      body.innerHTML = '<div class="empty">Select a lineage to inspect audience-directed communication.</div>';
      renders++;
      return;
    }

    let awareness = 0;
    let feedback = 0;
    let pointing = 0;
    let attending = 0;
    let recentActs = 0;
    let recentSuppressions = 0;
    const pairScores = new Map();

    for (const item of lineage) {
      const state = item.intent;
      if (!state) continue;
      awareness += Number(state.audienceAwareness) || 0;
      feedback += Number(state.feedbackLearning) || 0;
      pointing += Number(state.pointingControl) || 0;
      if (state.attendedSpeakerId != null) attending++;
      if (state.lastChoice?.emitted === true) recentActs++;
      if (state.lastChoice?.emitted === false) recentSuppressions++;
      for (const [key, utility] of Object.entries(state.utilities || {})) {
        const trials = Number(state.trials?.[key]) || 0;
        if (!trials) continue;
        const current = pairScores.get(key) || { utility:0, trials:0, users:0 };
        current.utility += Number(utility) || 0;
        current.trials += trials;
        current.users++;
        pairScores.set(key, current);
      }
    }

    const n = lineage.length || 1;
    const learned = [...pairScores.entries()]
      .map(([key, value]) => [key, value.users ? value.utility / value.users : 0, value.trials])
      .sort((a,b) => b[2] - a[2] || b[1] - a[1])
      .slice(0, 8);

    body.innerHTML = `
      <div class="intent-v56-grid">
        <div class="intent-v56-card"><b>${attending}</b><span>joint attention</span></div>
        <div class="intent-v56-card"><b>${recentActs}</b><span>chosen acts</span></div>
        <div class="intent-v56-card"><b>${recentSuppressions}</b><span>suppressed acts</span></div>
      </div>
      <div class="intent-v56-pairs">${learned.length ? learned.map(([key,utility,trials]) => `<span class="intent-v56-pair">${key} · ${utility >= 0 ? '+' : ''}${utility.toFixed(2)} · n=${trials}</span>`).join('') : '<span class="empty">No communicative outcome learned yet.</span>'}</div>
      <div class="intent-v56-note">Audience awareness ${(awareness/n).toFixed(2)} · feedback learning ${(feedback/n).toFixed(2)} · pointing ${(pointing/n).toFixed(2)}. Global intentional acts ${stats.intentionalActs || 0}; suppressed ${stats.suppressedActs || 0}; outcome-biased choices ${stats.outcomeBiasedChoices || 0}; successful influence ${stats.communicativeSuccesses || 0}; failed influence ${stats.communicativeFailures || 0}; decoded joint attention ${stats.decodedJointAttention || 0}.</div>`;
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

  window.realitySandboxCommunicativeIntentInspectorV56a = {
    installed:true,
    render,
    getStats:() => ({
      installed:true,
      renders,
      lineageIntentView:true,
      communicativeUtilityView:true,
      jointAttentionView:true,
      listenerFeedbackView:true,
      outcomeChoiceView:true,
      suppressionView:true,
    }),
  };
  document.documentElement.dataset.communicativeIntentInspectorV56a = 'ready-outcome-choice';
}

waitForRuntime().then(install);
