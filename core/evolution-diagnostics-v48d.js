async function waitForRuntime() {
  while (true) {
    const origin = window.realitySandboxOriginMotileLifeV47;
    const inspector = window.realitySandboxEvolutionInspectorV47b;
    const morphology = window.realitySandboxEvolutionMorphologyV47c;
    const milestones = window.realitySandboxEvolutionaryMilestonesV47d;
    const population = window.realitySandboxLineagePopulationRecordV47e;
    const deepTime = window.realitySandboxEvolutionDeepTimeV47f;
    const morphogenesis = window.realitySandboxMorphogenesisV48;
    const inheritance = window.realitySandboxMorphogenesisInheritanceCacheV48a;
    const selection = window.realitySandboxMorphogenesisSelectionV48b;
    const history = window.realitySandboxMorphogenesisHistoryV48c;
    if (origin?.installed && inspector?.installed && morphology?.installed && milestones?.installed && population?.installed && deepTime?.installed && morphogenesis?.installed && inheritance?.installed && selection?.installed && history?.installed) {
      return { origin, inspector, morphology, milestones, population, deepTime, morphogenesis, inheritance, selection, history };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install(parts) {
  if (window.realitySandboxEvolutionDiagnosticsV48d?.installed) return;

  function retiredFaunaModules() {
    return {
      surfaceCreaturesV44: Boolean(window.realitySandboxSurfaceCreaturesV44),
      localFaunaV44d: Boolean(window.realitySandboxSurfaceLocalFaunaV44d),
      creatureVisibilityV44b: Boolean(window.realitySandboxSurfaceCreatureVisibilityV44b),
      creatureReadabilityV44c: Boolean(window.realitySandboxSurfaceCreatureReadabilityV44c),
      faunaGuaranteeV45b: Boolean(window.realitySandboxSurfaceFaunaGuaranteeV45b),
      faunaExactV46d: Boolean(window.realitySandboxSurfaceFaunaExactV46d),
      renderBridgeV46d: Boolean(window.realitySandboxSurfaceRenderBridgeV46d),
    };
  }

  function snapshot() {
    const lineagePhenotypes = parts.morphogenesis.getLineagePhenotypes?.() || [];
    const bodyPlanCounts = {};
    for (const lineage of lineagePhenotypes) {
      const plan = lineage.dominantBodyPlan || 'unknown';
      bodyPlanCounts[plan] = (bodyPlanCounts[plan] || 0) + 1;
    }
    const fauna = retiredFaunaModules();
    return {
      ready: true,
      build: window.realitySandboxSurfaceBuild,
      surfaceFaunaPolicy: document.documentElement.dataset.surfaceFaunaPolicy,
      origin: parts.origin.getStats(),
      inspector: parts.inspector.getStats(),
      schematic: parts.morphology.getStats(),
      milestones: parts.milestones.getStats(),
      populationRecord: parts.population.getStats(),
      deepTime: parts.deepTime.getStats(),
      morphogenesis: parts.morphogenesis.getStats(),
      inheritance: parts.inheritance.getStats(),
      habitatSelection: parts.selection.getStats(),
      bodyPlanHistory: parts.history.getStats(),
      lineageCounts: {
        total: parts.origin.getLineages().length,
        motile: parts.origin.getLineages().filter(lineage => lineage.type === 'motile').length,
        plant: parts.origin.getLineages().filter(lineage => lineage.type === 'photosynthetic').length,
      },
      lineagePhenotypes,
      bodyPlanCounts,
      retiredFaunaModules: fauna,
      retiredFaunaModulesAbsent: Object.values(fauna).every(value => value === false),
      noHardPopulationCap:
        parts.origin.getStats().hardPopulationCap === false &&
        parts.morphogenesis.getStats().hardPopulationCap === false &&
        parts.inheritance.getStats().hardPopulationCap === false &&
        parts.selection.getStats().hardPopulationCap === false,
      surfaceFaunaRendererDisabled:
        parts.origin.getStats().legacyFaunaRendererEnabled === false &&
        parts.morphogenesis.getStats().surfaceRendererEnabled === false &&
        parts.selection.getStats().surfaceRendererEnabled === false,
    };
  }

  function invariants() {
    const state = snapshot();
    const failures = [];
    if (!state.retiredFaunaModulesAbsent) failures.push('A retired Surface-fauna experiment is loaded.');
    if (!state.noHardPopulationCap) failures.push('An evolution module reports a hard population cap.');
    if (!state.surfaceFaunaRendererDisabled) failures.push('A v47/v48 fauna renderer is unexpectedly enabled.');
    if (!state.origin.plantFirstOrigin) failures.push('Plant-first origin mode is inactive.');
    if (!state.origin.authoritativeFixedStep || !state.morphogenesis.authoritativeFixedStep || !state.inheritance.authoritativeFixedStep || !state.habitatSelection.authoritativeFixedStep || !state.bodyPlanHistory.authoritativeFixedStep) {
      failures.push('An evolution subsystem is outside the authoritative fixed step.');
    }
    if (state.morphogenesis.traits?.length !== 9) failures.push('v48 developmental trait schema is incomplete.');
    if (state.inheritance.birthInheritanceComplexity !== 'O(1)') failures.push('v48 developmental inheritance is not using the O(1) lineage cache.');
    if (!state.deepTime.reducedOrderEvolutionaryTime) failures.push('Evolutionary deep-time scaling is inactive.');
    return { ok: failures.length === 0, failures, snapshot: state };
  }

  const api = { installed: true, snapshot, invariants };
  window.realitySandboxEvolutionDiagnosticsV48d = api;
  document.documentElement.dataset.evolutionDiagnosticsV48d = 'ready';

  if (window.realitySandboxDebug && typeof window.realitySandboxDebug === 'object') {
    window.realitySandboxDebug.evolution = snapshot;
    window.realitySandboxDebug.evolutionInvariants = invariants;
  }

  const previousPresentationDiagnostics = window.realitySandboxPresentationDiagnostics;
  window.realitySandboxPresentationDiagnostics = () => ({
    ...(typeof previousPresentationDiagnostics === 'function' ? previousPresentationDiagnostics() : {}),
    evolutionV48: snapshot(),
  });
}

waitForRuntime().then(install);