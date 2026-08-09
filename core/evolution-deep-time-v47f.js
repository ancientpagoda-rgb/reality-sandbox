const BIOLOGY_STEP_SECONDS = 0.9;
const FIXED_DT_SECONDS = 0.06;
const YEARS_PER_BIOLOGY_STEP = 25000;
const YEARS_PER_WORLD_TICK = YEARS_PER_BIOLOGY_STEP * (FIXED_DT_SECONDS / BIOLOGY_STEP_SECONDS);
const UPDATE_MS = 700;

async function waitForRuntime() {
  while (true) {
    const origin = window.realitySandboxOriginMotileLifeV47;
    const inspector = window.realitySandboxEvolutionInspectorV47b;
    const populationRecord = window.realitySandboxLineagePopulationRecordV47e;
    const history = window.realitySandboxEvolutionaryMilestonesV47d;
    const planet = window.realitySandboxPlanet;
    const host = document.getElementById('evolutionInspectorV47bHost');
    if (origin?.installed && inspector?.installed && populationRecord?.installed && history?.installed && planet?.world && host?.shadowRoot) {
      return { origin, inspector, populationRecord, history, planet, root: host.shadowRoot };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function formatYears(years) {
  const value = Math.max(0, Number(years) || 0);
  if (value >= 1e9) return `${(value / 1e9).toFixed(value >= 10e9 ? 1 : 2)} Gyr`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(value >= 10e6 ? 1 : 2)} Myr`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(value >= 10e3 ? 0 : 1)} kyr`;
  return `${Math.round(value)} yr`;
}

function install({ origin, inspector, populationRecord, history, planet, root }) {
  if (window.realitySandboxEvolutionDeepTimeV47f?.installed) return;

  const style = document.createElement('style');
  style.textContent = `
    .deep-time-v47f { margin:8px 0 2px; padding:8px 9px; border-radius:9px; background:linear-gradient(90deg,rgba(105,177,128,.09),rgba(255,255,255,.025)); border:1px solid rgba(150,214,169,.10); }
    .deep-time-top-v47f { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
    .deep-time-age-v47f { font-size:16px; font-weight:850; letter-spacing:.01em; }
    .deep-time-label-v47f { font-size:8px; text-transform:uppercase; letter-spacing:.10em; opacity:.50; }
    .deep-time-meta-v47f { margin-top:4px; font-size:8px; opacity:.48; line-height:1.4; }
  `;
  root.appendChild(style);

  const summary = root.querySelector('.summary');
  const box = document.createElement('div');
  box.className = 'deep-time-v47f';
  box.innerHTML = '<div class="deep-time-top-v47f"><div><div class="deep-time-age-v47f">0 yr</div><div class="deep-time-label-v47f">evolutionary deep time</div></div><div class="deep-time-selected-v47f"></div></div><div class="deep-time-meta-v47f">Reduced-order scale · 25,000 years per v47 biology update</div>';
  summary?.insertAdjacentElement('afterend', box);

  function yearsAtWorldTick(tick) {
    return Math.max(0, Number(tick) || 0) * YEARS_PER_WORLD_TICK;
  }

  function formatWorldTick(tick) {
    return formatYears(yearsAtWorldTick(tick));
  }

  function currentYears() {
    return Math.max(0, Number(origin.getStats?.().ticks) || 0) * YEARS_PER_BIOLOGY_STEP;
  }

  function render() {
    box.querySelector('.deep-time-age-v47f').textContent = formatYears(currentYears());
    const selected = inspector.getStats?.().selectedLineageId;
    const target = box.querySelector('.deep-time-selected-v47f');
    if (!selected || !target) return;
    const record = populationRecord.getRecord(selected);
    const milestones = history.getMilestones(selected);
    if (!record) {
      target.innerHTML = '<div class="deep-time-label-v47f">lineage age</div><div style="font-size:11px">—</div>';
      return;
    }
    const first = yearsAtWorldTick(record.firstTick);
    const latest = currentYears();
    const age = Math.max(0, latest - first);
    const firstMilestone = milestones.length ? Math.min(...milestones.map(item => yearsAtWorldTick(item.tick))) : null;
    target.innerHTML = `<div class="deep-time-label-v47f">lineage age</div><div style="font-size:11px;font-weight:750">${formatYears(age)}</div>${firstMilestone != null ? `<div style="font-size:7px;opacity:.45;margin-top:2px">first milestone ${formatYears(firstMilestone)}</div>` : ''}`;
  }

  let last = -Infinity;
  function loop(now) {
    requestAnimationFrame(loop);
    if (!inspector.isOpen?.() || now - last < UPDATE_MS) return;
    last = now;
    render();
  }
  requestAnimationFrame(loop);
  root.querySelector('.lineage-select')?.addEventListener('change', () => queueMicrotask(render));

  const api = {
    installed: true,
    yearsPerBiologyStep: YEARS_PER_BIOLOGY_STEP,
    yearsPerWorldTick: YEARS_PER_WORLD_TICK,
    currentYears,
    yearsAtWorldTick,
    formatYears,
    formatWorldTick,
    render,
    getStats: () => ({
      installed: true,
      currentYears: currentYears(),
      yearsPerBiologyStep: YEARS_PER_BIOLOGY_STEP,
      yearsPerWorldTick: YEARS_PER_WORLD_TICK,
      reducedOrderEvolutionaryTime: true,
      biologyStepSeconds: BIOLOGY_STEP_SECONDS,
      fixedDtSeconds: FIXED_DT_SECONDS,
    }),
  };
  window.realitySandboxEvolutionDeepTimeV47f = api;
  document.documentElement.dataset.evolutionDeepTimeV47f = '25000-years-per-biology-step';
  render();
}

waitForRuntime().then(install);
