const UPDATE_MS = 1000;

async function waitForRuntime() {
  while (true) {
    const social = window.realitySandboxSocialSignalingV51;
    const inspector = window.realitySandboxEvolutionInspectorV47b;
    const host = document.getElementById('evolutionInspectorV47bHost');
    if (social?.installed && inspector?.installed && host?.shadowRoot) return { social, inspector, root: host.shadowRoot };
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ social, inspector, root }) {
  if (window.realitySandboxSocialSignalingInspectorV51a?.installed) return;
  const style = document.createElement('style');
  style.textContent = `
    .social-v51 { margin-top:11px; }
    .social-v51-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; }
    .social-v51-card { padding:8px; border-radius:9px; background:rgba(255,255,255,.038); }
    .social-v51-card b { display:block; font-size:13px; }
    .social-v51-card span { display:block; margin-top:3px; font-size:8px; text-transform:uppercase; letter-spacing:.06em; opacity:.5; }
    .social-v51-note { margin-top:7px; padding:7px 8px; border-radius:8px; background:rgba(132,205,154,.07); font-size:8px; line-height:1.45; opacity:.65; }
  `;
  root.appendChild(style);

  const brainSection = root.querySelector('.brain-v50');
  const behaviorSection = root.querySelector('.behavior')?.closest('.section');
  const anchor = brainSection || behaviorSection;
  if (!anchor) return;

  const section = document.createElement('div');
  section.className = 'section social-v51';
  section.innerHTML = '<div class="section-label">Social signaling</div><div class="social-v51-body"></div>';
  anchor.insertAdjacentElement('afterend', section);

  let renders = 0;
  let last = 0;

  function render() {
    const selected = inspector.getStats?.().selectedLineageId;
    const received = social.getSignalsReceived?.() || [];
    const lineageSignals = selected ? received.filter(item => item.lineageId === selected) : [];
    const stats = social.getStats?.() || {};
    const body = section.querySelector('.social-v51-body');
    if (!selected) {
      body.innerHTML = '<div class="empty">Select a lineage to inspect social signaling.</div>';
      renders++;
      return;
    }
    const counts = { alarm:0, food:0, hunt:0 };
    for (const item of lineageSignals) if (counts[item.signalType] != null) counts[item.signalType]++;
    body.innerHTML = `
      <div class="social-v51-grid">
        <div class="social-v51-card"><b>${counts.alarm}</b><span>alarm receivers</span></div>
        <div class="social-v51-card"><b>${counts.food}</b><span>food receivers</span></div>
        <div class="social-v51-card"><b>${counts.hunt}</b><span>hunt receivers</span></div>
      </div>
      <div class="social-v51-note">Global calls: ${stats.alarmCalls || 0} alarm · ${stats.foodCalls || 0} food · ${stats.huntCalls || 0} pack-hunt. Coordinated lineages this step: ${stats.coordinatedLineages || 0}. Mean signal radius: ${Math.round(stats.meanSignalRadius || 0)}.</div>`;
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

  window.realitySandboxSocialSignalingInspectorV51a = {
    installed:true,
    render,
    getStats: () => ({ installed:true, renders, lineageSignalView:true, globalSignalSummary:true }),
  };
  document.documentElement.dataset.socialSignalingInspectorV51a = 'ready';
}

waitForRuntime().then(install);
