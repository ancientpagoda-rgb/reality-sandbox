const SAMPLE_SECONDS = 7.2;

async function waitForRuntime() {
  while (true) {
    const morphogenesis = window.realitySandboxMorphogenesisV48;
    const selection = window.realitySandboxMorphogenesisSelectionV48b;
    const deepTime = window.realitySandboxEvolutionDeepTimeV47f;
    const inspector = window.realitySandboxEvolutionInspectorV47b;
    const origin = window.realitySandboxOriginMotileLifeV47;
    const planet = window.realitySandboxPlanet;
    const modules = window.realitySandboxModules;
    const host = document.getElementById('evolutionInspectorV47bHost');
    if (morphogenesis?.installed && selection?.installed && deepTime?.installed && inspector?.installed && origin?.installed && planet?.world?.ecs?.components && modules?.step && host?.shadowRoot) {
      return { morphogenesis, selection, deepTime, inspector, origin, planet, modules, root: host.shadowRoot };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ morphogenesis, deepTime, inspector, origin, planet, modules, root }) {
  if (window.realitySandboxMorphogenesisHistoryV48c?.installed) return;

  const { world } = planet;
  const { motile } = world.ecs.components;
  const events = [];
  const seenTransitions = new Set();
  const seenLineagePlans = new Set();
  const seenThresholds = new Set();
  let accumulator = 0;
  let samples = 0;

  const style = document.createElement('style');
  style.textContent = `
    .body-history-v48c { margin-top:11px; }
    .body-history-label-v48c { font-size:9px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; opacity:.58; margin:0 0 6px 2px; }
    .body-history-list-v48c { display:grid; gap:5px; }
    .body-history-event-v48c { padding:7px 8px; border-radius:8px; background:rgba(255,255,255,.035); border-left:2px solid rgba(185,218,156,.55); font-size:9px; line-height:1.38; }
    .body-history-event-v48c b { display:block; margin-bottom:2px; color:#edf7ef; }
    .body-history-context-v48c { margin-top:2px; opacity:.55; }
    .body-history-empty-v48c { padding:9px; border-radius:8px; background:rgba(255,255,255,.03); font-size:9px; opacity:.55; }
  `;
  root.appendChild(style);

  const bodyPlan = root.querySelector('.body-plan-v48');
  const section = document.createElement('div');
  section.className = 'body-history-v48c';
  section.innerHTML = '<div class="body-history-label-v48c">Body-plan history</div><div class="body-history-list-v48c"></div>';
  bodyPlan?.insertAdjacentElement('afterend', section);

  function lineageEnvironment(lineageId) {
    let count = 0;
    let fitness = 0;
    let water = 0;
    let land = 0;
    let aquatic = 0;
    let terrestrial = 0;
    for (const [, organism] of motile.entries()) {
      if (organism.lineageId !== lineageId || !organism.bioV48) continue;
      const env = organism.bioV48.selectionEnvironment;
      if (!env) continue;
      count++;
      fitness += Number(organism.bioV48.habitatFitness) || 0;
      water += Number(env.waterAccess) || 0;
      land += env.land ? 1 : 0;
      aquatic += Number(organism.bioV48.aquaticSupport) || 0;
      terrestrial += Number(organism.bioV48.terrestrialSupport) || 0;
    }
    if (!count) return null;
    return {
      habitatFitness: fitness / count,
      waterAccess: water / count,
      landFraction: land / count,
      aquaticSupport: aquatic / count,
      terrestrialSupport: terrestrial / count,
    };
  }

  function contextText(env) {
    if (!env) return 'habitat context unavailable';
    const route = env.aquaticSupport >= env.terrestrialSupport ? 'aquatic route favored' : 'terrestrial route favored';
    const wetness = env.waterAccess > 0.60 ? 'water-rich' : env.waterAccess < 0.22 ? 'water-poor' : 'mixed water access';
    return `${route}; ${wetness}; habitat fit ${Math.round(env.habitatFitness * 100)}%`;
  }

  function pushEvent(lineageId, tick, title, description, type) {
    const env = lineageEnvironment(lineageId);
    events.push({
      lineageId,
      tick,
      years: deepTime.yearsAtWorldTick(tick),
      timeLabel: deepTime.formatWorldTick(tick),
      title,
      description,
      context: contextText(env),
      environment: env ? { ...env } : null,
      type,
    });
    if (events.length > 300) events.splice(0, events.length - 300);
  }

  function captureTransitions() {
    for (const transition of morphogenesis.getTransitions?.() || []) {
      const key = `${transition.entityId}:${transition.tick}:${transition.to}`;
      if (seenTransitions.has(key)) continue;
      seenTransitions.add(key);
      const lineageKey = `${transition.lineageId}:${transition.to}`;
      if (seenLineagePlans.has(lineageKey)) continue;
      seenLineagePlans.add(lineageKey);
      pushEvent(
        transition.lineageId,
        transition.tick,
        `${transition.to} emerges`,
        `First recorded transition in this lineage from ${transition.from} to ${transition.to}.`,
        'body-plan',
      );
    }
  }

  function captureThresholds() {
    for (const phenotype of morphogenesis.getLineagePhenotypes?.() || []) {
      const baselineKey = `${phenotype.lineageId}:${phenotype.dominantBodyPlan}`;
      if (!seenLineagePlans.has(baselineKey)) {
        seenLineagePlans.add(baselineKey);
        pushEvent(
          phenotype.lineageId,
          world.tick,
          `${phenotype.dominantBodyPlan} observed`,
          `First recorded dominant body plan for this lineage: ${phenotype.dominantBodyPlan}.`,
          'first-observed-body-plan',
        );
      }

      const thresholds = [
        ['animal-like-35', phenotype.animalLikeScore >= 0.35, 'Animal-like organization rises', `Animal-like developmental score crossed 35%.`],
        ['animal-like-55', phenotype.animalLikeScore >= 0.55, 'Integrated animal-like body plan', `Animal-like developmental score crossed 55%.`],
        ['neural-50', phenotype.neuralComplexity >= 0.50, 'Complex neural organization', `Mean neural complexity crossed 50%.`],
        ['digestion-50', phenotype.digestion >= 0.50, 'Specialized digestion', `Mean digestive specialization crossed 50%.`],
        ['appendages-2', phenotype.meanAppendages >= 2, 'Paired appendages established', `Mean appendage count reached at least two.`],
      ];
      for (const [key, condition, title, description] of thresholds) {
        const seenKey = `${phenotype.lineageId}:${key}`;
        if (!condition || seenThresholds.has(seenKey)) continue;
        seenThresholds.add(seenKey);
        pushEvent(phenotype.lineageId, world.tick, title, description, 'developmental-threshold');
      }
    }
  }

  function sample() {
    captureTransitions();
    captureThresholds();
    samples++;
    render();
  }

  function render() {
    const target = section.querySelector('.body-history-list-v48c');
    if (!target) return;
    const selected = inspector.getStats?.().selectedLineageId;
    const relevant = events.filter(event => !selected || event.lineageId === selected).slice(-10).reverse();
    target.innerHTML = relevant.length
      ? relevant.map(event => `<div class="body-history-event-v48c"><b>${event.timeLabel} · ${event.title}</b>${event.description}<div class="body-history-context-v48c">${event.context}</div></div>`).join('')
      : '<div class="body-history-empty-v48c">No body-plan transition recorded for this lineage yet.</div>';
  }

  const previousStep = modules.step.bind(modules);
  modules.step = function v48cMorphogenesisHistoryStep(dt) {
    const result = previousStep(dt);
    accumulator += Number(dt) || 0;
    if (accumulator >= SAMPLE_SECONDS) {
      accumulator %= SAMPLE_SECONDS;
      sample();
    }
    return result;
  };

  root.querySelector('.lineage-select')?.addEventListener('change', () => queueMicrotask(render));

  const api = {
    installed: true,
    sample,
    render,
    getEvents: lineageId => events.filter(event => !lineageId || event.lineageId === lineageId).map(event => ({ ...event, environment: event.environment ? { ...event.environment } : null })),
    getStats: () => ({
      installed: true,
      samples,
      events: events.length,
      firstObservedBodyPlans: true,
      lineageBodyPlanFirstEmergence: true,
      developmentalThresholdHistory: true,
      deepTimeLabels: true,
      habitatContext: true,
      authoritativeFixedStep: true,
    }),
  };

  window.realitySandboxMorphogenesisHistoryV48c = api;
  document.documentElement.dataset.morphogenesisHistoryV48c = 'body-plans-deep-time-context';
  sample();
}

waitForRuntime().then(install);