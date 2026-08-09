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
    const nutrientCycle = window.realitySandboxClosedNutrientCycleV49;
    const brains = window.realitySandboxEvolvingBrainsV50;
    const brainInspector = window.realitySandboxBrainInspectorV50a;
    if (origin?.installed && inspector?.installed && morphology?.installed && milestones?.installed && population?.installed && deepTime?.installed && morphogenesis?.installed && inheritance?.installed && selection?.installed && history?.installed && nutrientCycle?.installed && brains?.installed && brainInspector?.installed) {
      return { origin, inspector, morphology, milestones, population, deepTime, morphogenesis, inheritance, selection, history, nutrientCycle, brains, brainInspector };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install(parts) {
  if (window.realitySandboxEvolutionDiagnosticsV48d?.installed) return;
  function retiredFaunaModules() {
    return {
      surfaceCreaturesV44:Boolean(window.realitySandboxSurfaceCreaturesV44), localFaunaV44d:Boolean(window.realitySandboxSurfaceLocalFaunaV44d),
      creatureVisibilityV44b:Boolean(window.realitySandboxSurfaceCreatureVisibilityV44b), creatureReadabilityV44c:Boolean(window.realitySandboxSurfaceCreatureReadabilityV44c),
      faunaGuaranteeV45b:Boolean(window.realitySandboxSurfaceFaunaGuaranteeV45b), faunaExactV46d:Boolean(window.realitySandboxSurfaceFaunaExactV46d), renderBridgeV46d:Boolean(window.realitySandboxSurfaceRenderBridgeV46d),
    };
  }
  function snapshot() {
    const lineagePhenotypes = parts.morphogenesis.getLineagePhenotypes?.() || [], bodyPlanCounts = {};
    for (const lineage of lineagePhenotypes) bodyPlanCounts[lineage.dominantBodyPlan || 'unknown'] = (bodyPlanCounts[lineage.dominantBodyPlan || 'unknown'] || 0) + 1;
    const fauna = retiredFaunaModules(), nutrientStats = parts.nutrientCycle.getStats(), brainStats = parts.brains.getStats();
    const lines = parts.origin.getLineages();
    return {
      ready:true, build:window.realitySandboxSurfaceBuild, evolutionBuild:window.realitySandboxEvolutionBuild || 'unknown', surfaceFaunaPolicy:document.documentElement.dataset.surfaceFaunaPolicy,
      origin:parts.origin.getStats(), inspector:parts.inspector.getStats(), schematic:parts.morphology.getStats(), milestones:parts.milestones.getStats(), populationRecord:parts.population.getStats(), deepTime:parts.deepTime.getStats(),
      morphogenesis:parts.morphogenesis.getStats(), inheritance:parts.inheritance.getStats(), habitatSelection:parts.selection.getStats(), bodyPlanHistory:parts.history.getStats(), nutrientCycle:nutrientStats,
      evolvingBrains:brainStats, brainInspector:parts.brainInspector.getStats(),
      lineageCounts:{ total:lines.length, motile:lines.filter(x=>x.type==='motile').length, plant:lines.filter(x=>x.type==='photosynthetic').length },
      lineagePhenotypes, lineageBrains:parts.brains.getLineageBrains(), bodyPlanCounts, retiredFaunaModules:fauna, retiredFaunaModulesAbsent:Object.values(fauna).every(v=>v===false),
      noHardPopulationCap:parts.origin.getStats().hardPopulationCap===false && parts.morphogenesis.getStats().hardPopulationCap===false && parts.inheritance.getStats().hardPopulationCap===false && parts.selection.getStats().hardPopulationCap===false && nutrientStats.hardPopulationCap===false && brainStats.hardPopulationCap===false,
      surfaceFaunaRendererDisabled:parts.origin.getStats().legacyFaunaRendererEnabled===false && parts.morphogenesis.getStats().surfaceRendererEnabled===false && parts.selection.getStats().surfaceRendererEnabled===false && nutrientStats.surfaceRendererEnabled===false && brainStats.surfaceRendererEnabled===false,
    };
  }
  function invariants() {
    const state = snapshot(), failures = [];
    if (!state.retiredFaunaModulesAbsent) failures.push('A retired Surface-fauna experiment is loaded.');
    if (!state.noHardPopulationCap) failures.push('An evolution module reports a hard population cap.');
    if (!state.surfaceFaunaRendererDisabled) failures.push('A v47-v50 fauna renderer is unexpectedly enabled.');
    if (!state.origin.plantFirstOrigin) failures.push('Plant-first origin mode is inactive.');
    if (!state.origin.authoritativeFixedStep || !state.morphogenesis.authoritativeFixedStep || !state.inheritance.authoritativeFixedStep || !state.habitatSelection.authoritativeFixedStep || !state.bodyPlanHistory.authoritativeFixedStep || !state.nutrientCycle.authoritativeFixedStep || !state.evolvingBrains.authoritativeFixedStep) failures.push('An evolution subsystem is outside the authoritative fixed step.');
    if (state.morphogenesis.traits?.length !== 9) failures.push('v48 developmental trait schema is incomplete.');
    if (state.inheritance.birthInheritanceComplexity !== 'O(1)') failures.push('v48 developmental inheritance is not using the O(1) lineage cache.');
    if (!state.deepTime.reducedOrderEvolutionaryTime) failures.push('Evolutionary deep-time scaling is inactive.');
    if (state.evolutionBuild !== 'evolution-v50-evolving-brains') failures.push(`Unexpected evolution build ${state.evolutionBuild}.`);
    if (!state.nutrientCycle.detritusToSoil || !state.nutrientCycle.metabolicWasteToSoil || !state.nutrientCycle.soilToPlantBiomass || !state.nutrientCycle.weatheringAndLeaching || !state.nutrientCycle.toxinSoilFeedback) failures.push('The v49 closed nutrient cycle is incomplete.');
    if (!Number.isFinite(state.nutrientCycle.meanNutrient) || state.nutrientCycle.meanNutrient < 0) failures.push('The v49 nutrient field is invalid.');
    if (state.evolvingBrains.sensors?.length !== 8 || state.evolvingBrains.actions?.length !== 6) failures.push('The v50 sensor-action brain schema is incomplete.');
    if (!state.evolvingBrains.inheritedSensorActionWeights || !state.evolvingBrains.behaviorAffectsMovementAndRest || !state.evolvingBrains.behaviorSelectionThroughEcology) failures.push('The v50 evolving-brain behavior loop is incomplete.');
    if (!state.evolvingBrains.spatiallyHashedSensing) failures.push('v50 brain sensing is not spatially hashed.');
    if (!state.brainInspector.sensorActionWeights || !state.brainInspector.actionDistribution || state.brainInspector.surfaceRendererTouched) failures.push('The v50 brain inspector contract is incomplete.');
    return { ok:failures.length===0, failures, snapshot:state };
  }
  const api = { installed:true, snapshot, invariants };
  window.realitySandboxEvolutionDiagnosticsV48d = api;
  document.documentElement.dataset.evolutionDiagnosticsV48d = 'ready-v50';
  if (window.realitySandboxDebug && typeof window.realitySandboxDebug === 'object') { window.realitySandboxDebug.evolution = snapshot; window.realitySandboxDebug.evolutionInvariants = invariants; }
  const previousPresentationDiagnostics = window.realitySandboxPresentationDiagnostics;
  window.realitySandboxPresentationDiagnostics = () => ({ ...(typeof previousPresentationDiagnostics === 'function' ? previousPresentationDiagnostics() : {}), evolutionV50:snapshot() });
}
waitForRuntime().then(install);