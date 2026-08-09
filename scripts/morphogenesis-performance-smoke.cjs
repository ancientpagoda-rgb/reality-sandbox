const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_MORPHOGENESIS_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'morphogenesis-smoke');
fs.mkdirSync(artifactDir, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.REALITY_CHROMIUM_PATH ? { executablePath: process.env.REALITY_CHROMIUM_PATH } : {}),
    args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => Boolean(
      window.realitySandboxDebug?.ready &&
      window.realitySandboxOriginMotileLifeV47?.installed &&
      window.realitySandboxMorphogenesisV48?.installed &&
      window.realitySandboxMorphogenesisInheritanceCacheV48a?.installed &&
      window.realitySandboxMorphogenesisSelectionV48b?.installed &&
      window.realitySandboxClosedNutrientCycleV49?.installed &&
      window.realitySandboxEvolutionDiagnosticsV48d?.installed
    ), null, { timeout: 120000 });

    await page.evaluate(() => window.realitySandboxDebug.advance(3000));

    const result = await page.evaluate(() => {
      const planet = window.realitySandboxPlanet;
      const origin = window.realitySandboxOriginMotileLifeV47;
      const morphogenesis = window.realitySandboxMorphogenesisV48;
      const cache = window.realitySandboxMorphogenesisInheritanceCacheV48a;
      const selection = window.realitySandboxMorphogenesisSelectionV48b;
      const nutrientCycle = window.realitySandboxClosedNutrientCycleV49;
      const diagnostics = window.realitySandboxEvolutionDiagnosticsV48d;
      const ecs = planet.world.ecs;
      const c = ecs.components;
      const existing = origin.getMotiles()[0];
      if (!existing) return { missingMotile: true };

      const before = cache.getStats();

      // 1) Normal descendant of an existing motile lineage: O(1) lineage prototype.
      const id = ecs.createEntity();
      c.position.set(id, existing.position ? { ...existing.position } : { x: 100, y: 100 });
      c.velocity.set(id, { vx: 0, vy: 0 });
      const testOrganism = {
        lineageId: existing.lineageId,
        generation: (existing.generation || 0) + 1,
        plantAncestorId: existing.plantAncestorId,
        energy: 1,
        age: 0,
        state: 'awake',
        sleepDebt: 0,
        decisionCooldown: 0,
        neurotoxinLoad: 0,
        genome: { ...existing.genome },
      };
      c.motile.set(id, testOrganism);
      const inserted = c.motile.get(id);
      const genes = inserted?.bioV48?.genes ? { ...inserted.bioV48.genes } : null;
      const inheritedBy = inserted?.bioV48?.inheritedBy || null;
      ecs.destroyEntity(id);

      // 2) First motile descendant of a new lineage with an actual v48 plant ancestor.
      const plantEntry = [...c.resource.entries()].find(([, res]) => res?.bioV48?.genes && res?.bioV47?.genome);
      let plantInheritance = null;
      if (plantEntry) {
        const [plantId, plant] = plantEntry;
        const plantPos = c.position.get(plantId) || existing.position || { x: 120, y: 120 };
        const plantChildId = ecs.createEntity();
        c.position.set(plantChildId, { ...plantPos });
        c.velocity.set(plantChildId, { vx: 0, vy: 0 });
        c.motile.set(plantChildId, {
          lineageId: `smoke-plant-origin-${plantChildId}`,
          generation: 0,
          plantAncestorId: plantId,
          energy: 1,
          age: 0,
          state: 'awake',
          sleepDebt: 0,
          decisionCooldown: 0,
          neurotoxinLoad: 0,
          genome: { ...plant.bioV47.genome, motility: Math.max(0.25, plant.bioV47.genome.motility || 0), heterotrophy: Math.max(0.23, plant.bioV47.genome.heterotrophy || 0) },
        });
        const plantChild = c.motile.get(plantChildId);
        plantInheritance = {
          inheritedBy: plantChild?.bioV48?.inheritedBy || null,
          developmentalPlantAncestorId: plantChild?.bioV48?.developmentalPlantAncestorId ?? null,
          geneKeys: plantChild?.bioV48?.genes ? Object.keys(plantChild.bioV48.genes).sort() : [],
        };
        ecs.destroyEntity(plantChildId);
      }

      const afterInsert = cache.getStats();
      const nutrient = nutrientCycle.getStats();
      const samplePosition = existing.position || { x: 100, y: 100 };
      const nutrientSample = nutrientCycle.sample(samplePosition.x, samplePosition.y);
      const invariantResult = diagnostics.invariants();

      return {
        missingMotile: false,
        build: window.realitySandboxSurfaceBuild,
        evolutionBuild: window.realitySandboxEvolutionBuild,
        morphogenesis: morphogenesis.getStats(),
        cacheBefore: before,
        cacheAfter: afterInsert,
        selection: selection.getStats(),
        nutrient,
        nutrientSample,
        diagnostics: invariantResult,
        inheritedBy,
        genes,
        geneKeys: genes ? Object.keys(genes).sort() : [],
        plantInheritance,
        lineagePhenotypes: morphogenesis.getLineagePhenotypes(),
        legacyFauna: { agent: c.agent.size, predator: c.predator.size, apex: c.apex.size },
      };
    });

    assert(!result.missingMotile, 'v48/v49 performance smoke had no evolved motile organism to clone.');
    assert(result.build === 'surface-v48-morphogenesis-body-plans', `Unexpected Surface build ${result.build}.`);
    assert(result.evolutionBuild === 'evolution-v49-closed-nutrient-cycle', `Unexpected evolution build ${result.evolutionBuild}.`);
    assert(result.morphogenesis.heritableDevelopmentalTraits && result.morphogenesis.authoritativeFixedStep, 'v48 morphogenesis is not installed on the authoritative fixed step.');
    assert(result.morphogenesis.traits.length === 9, `Expected 9 developmental traits, found ${result.morphogenesis.traits.length}.`);
    assert(result.morphogenesis.hardPopulationCap === false && result.morphogenesis.surfaceRendererEnabled === false, 'v48 changed the no-cap/no-Surface-renderer policy.');
    assert(result.cacheAfter.birthInheritanceComplexity === 'O(1)' && result.cacheAfter.fullPopulationBirthSearchAvoided === true, 'v48a did not install the O(1) birth inheritance path.');
    assert(result.cacheAfter.hardPopulationCap === false && result.cacheAfter.authoritativeFixedStep === true, 'v48a changed population policy or clock ownership.');
    assert(result.cacheAfter.developmentalContinuityAcrossSpeciation === true && result.cacheAfter.plantToMotileDevelopmentalContinuity === true, 'v48a developmental continuity guarantees are inactive.');
    assert(result.cacheAfter.birthsPreseeded >= result.cacheBefore.birthsPreseeded + 1, 'Temporary descendant did not pass through the cached inheritance hook.');
    assert(result.inheritedBy === 'v48a-lineage-cache', `Unexpected developmental inheritance marker ${result.inheritedBy}.`);
    assert(result.genes && result.geneKeys.length === 9, `Cached descendant has incomplete developmental genes: ${result.geneKeys.join(', ')}`);
    assert(result.geneKeys.includes('multicellularity') && result.geneKeys.includes('neuralComplexity') && result.geneKeys.includes('terrestrialAffinity'), 'Core v48 developmental genes are missing.');
    assert(result.plantInheritance, 'No v48 plant ancestor was available for continuity verification.');
    assert(result.plantInheritance.inheritedBy === 'v48a-plant-ancestor', `Plant→motile development was not inherited from the actual plant ancestor: ${result.plantInheritance.inheritedBy}.`);
    assert(result.plantInheritance.developmentalPlantAncestorId != null && result.plantInheritance.geneKeys.length === 9, 'Plant→motile developmental inheritance is incomplete.');
    assert(result.lineagePhenotypes.length >= 1, 'v48 produced no lineage phenotype summary after deep-time advance.');
    assert(result.selection.authoritativeFixedStep && result.selection.developmentalHabitatSelection, 'v48b habitat selection is not on the authoritative fixed step.');
    assert(result.selection.habitatAffectsEnergyBudget && result.selection.habitatAffectsReproductionIndirectly, 'v48b habitat fit is not coupled to ecological success.');
    assert(result.selection.selectionSteps >= 1 && result.selection.organismsEvaluated >= 1, 'v48b did not evaluate evolved motiles.');
    assert(result.selection.aquaticSelections + result.selection.terrestrialSelections >= result.selection.organismsEvaluated, 'v48b failed to classify developmental habitat routes.');
    assert(Number.isFinite(result.selection.meanHabitatFitness) && result.selection.meanHabitatFitness >= 0 && result.selection.meanHabitatFitness <= 1, 'v48b habitat fitness is invalid.');
    assert(result.selection.hardPopulationCap === false && result.selection.surfaceRendererEnabled === false, 'v48b introduced a cap or Surface fauna renderer.');

    assert(result.nutrient.installed && result.nutrient.authoritativeFixedStep, 'v49 closed nutrient cycle is not installed on the authoritative fixed step.');
    assert(result.nutrient.detritusToSoil && result.nutrient.metabolicWasteToSoil && result.nutrient.soilToPlantBiomass, 'v49 nutrient return loop is incomplete.');
    assert(result.nutrient.toxinSoilFeedback && result.nutrient.weatheringAndLeaching && result.nutrient.localNutrientField, 'v49 soil chemistry or geochemical inputs are incomplete.');
    assert(result.nutrient.hardPopulationCap === false && result.nutrient.hardDisplayCap === false && result.nutrient.surfaceRendererEnabled === false, 'v49 changed population/display/Surface-renderer policy.');
    assert(result.nutrient.steps >= 1 && result.nutrient.diffusionPasses >= 1, 'v49 nutrient field never advanced or diffused.');
    assert(result.nutrient.plantUptake > 0, 'v49 plants never drew nutrients from soil.');
    assert(result.nutrient.weatheringInputs > 0, 'v49 weathering never supplied mineral nutrients.');
    assert(result.nutrient.metabolicWasteDeposits > 0, 'v49 motile metabolism never returned nutrients to soil.');
    assert(Number.isFinite(result.nutrient.meanNutrient) && result.nutrient.meanNutrient >= 0, `v49 mean nutrient is invalid: ${result.nutrient.meanNutrient}.`);
    assert(Number.isFinite(result.nutrient.minNutrient) && Number.isFinite(result.nutrient.maxNutrient) && result.nutrient.maxNutrient >= result.nutrient.minNutrient, 'v49 nutrient range is invalid.');
    assert(Number.isFinite(result.nutrientSample?.nutrient) && result.nutrientSample.nutrient >= 0, 'v49 local nutrient sample is invalid.');
    assert(Number.isFinite(result.nutrientSample?.toxin) && result.nutrientSample.toxin >= 0, 'v49 local soil-toxin sample is invalid.');
    assert(result.diagnostics?.ok === true, `Evolution invariants failed: ${(result.diagnostics?.failures || []).join(' | ')}`);

    assert(result.legacyFauna.agent === 0 && result.legacyFauna.predator === 0 && result.legacyFauna.apex === 0, 'Legacy hard-coded fauna returned during v48/v49 performance smoke.');
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'morphogenesis-performance.json'), JSON.stringify({ result, pageErrors }, null, 2));
    await page.screenshot({ path: path.join(artifactDir, 'morphogenesis-performance.png'), fullPage: true });
  } finally {
    await browser.close();
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }
})().catch(error => {
  fs.writeFileSync(path.join(artifactDir, 'fatal-error.txt'), `${error.stack || error.message}\n`);
  console.error(error);
  process.exitCode = 1;
});