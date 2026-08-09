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
      window.realitySandboxMorphogenesisSelectionV48b?.installed
    ), null, { timeout: 120000 });

    await page.evaluate(() => window.realitySandboxDebug.advance(3000));

    const result = await page.evaluate(() => {
      const planet = window.realitySandboxPlanet;
      const origin = window.realitySandboxOriginMotileLifeV47;
      const morphogenesis = window.realitySandboxMorphogenesisV48;
      const cache = window.realitySandboxMorphogenesisInheritanceCacheV48a;
      const selection = window.realitySandboxMorphogenesisSelectionV48b;
      const ecs = planet.world.ecs;
      const c = ecs.components;
      const existing = origin.getMotiles()[0];
      if (!existing) return { missingMotile: true };

      const before = cache.getStats();
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
      const afterInsert = cache.getStats();
      ecs.destroyEntity(id);

      return {
        missingMotile: false,
        build: window.realitySandboxSurfaceBuild,
        morphogenesis: morphogenesis.getStats(),
        cacheBefore: before,
        cacheAfter: afterInsert,
        selection: selection.getStats(),
        inheritedBy,
        genes,
        geneKeys: genes ? Object.keys(genes).sort() : [],
        lineagePhenotypes: morphogenesis.getLineagePhenotypes(),
        legacyFauna: { agent: c.agent.size, predator: c.predator.size, apex: c.apex.size },
      };
    });

    assert(!result.missingMotile, 'v48 performance smoke had no evolved motile organism to clone.');
    assert(result.build === 'surface-v48-morphogenesis-body-plans', `Unexpected build ${result.build}.`);
    assert(result.morphogenesis.heritableDevelopmentalTraits && result.morphogenesis.authoritativeFixedStep, 'v48 morphogenesis is not installed on the authoritative fixed step.');
    assert(result.morphogenesis.traits.length === 9, `Expected 9 developmental traits, found ${result.morphogenesis.traits.length}.`);
    assert(result.morphogenesis.hardPopulationCap === false && result.morphogenesis.surfaceRendererEnabled === false, 'v48 changed the no-cap/no-Surface-renderer policy.');
    assert(result.cacheAfter.birthInheritanceComplexity === 'O(1)' && result.cacheAfter.fullPopulationBirthSearchAvoided === true, 'v48a did not install the O(1) birth inheritance path.');
    assert(result.cacheAfter.hardPopulationCap === false && result.cacheAfter.authoritativeFixedStep === true, 'v48a changed population policy or clock ownership.');
    assert(result.cacheAfter.birthsPreseeded === result.cacheBefore.birthsPreseeded + 1, 'Temporary descendant did not pass through the cached inheritance hook.');
    assert(result.inheritedBy === 'v48a-lineage-cache', `Unexpected developmental inheritance marker ${result.inheritedBy}.`);
    assert(result.genes && result.geneKeys.length === 9, `Cached descendant has incomplete developmental genes: ${result.geneKeys.join(', ')}`);
    assert(result.geneKeys.includes('multicellularity') && result.geneKeys.includes('neuralComplexity') && result.geneKeys.includes('terrestrialAffinity'), 'Core v48 developmental genes are missing.');
    assert(result.lineagePhenotypes.length >= 1, 'v48 produced no lineage phenotype summary after deep-time advance.');
    assert(result.selection.authoritativeFixedStep && result.selection.developmentalHabitatSelection, 'v48b habitat selection is not on the authoritative fixed step.');
    assert(result.selection.habitatAffectsEnergyBudget && result.selection.habitatAffectsReproductionIndirectly, 'v48b habitat fit is not coupled to ecological success.');
    assert(result.selection.selectionSteps >= 1 && result.selection.organismsEvaluated >= 1, 'v48b did not evaluate evolved motiles.');
    assert(result.selection.aquaticSelections + result.selection.terrestrialSelections >= result.selection.organismsEvaluated, 'v48b failed to classify developmental habitat routes.');
    assert(Number.isFinite(result.selection.meanHabitatFitness) && result.selection.meanHabitatFitness >= 0 && result.selection.meanHabitatFitness <= 1, 'v48b habitat fitness is invalid.');
    assert(result.selection.hardPopulationCap === false && result.selection.surfaceRendererEnabled === false, 'v48b introduced a cap or Surface fauna renderer.');
    assert(result.legacyFauna.agent === 0 && result.legacyFauna.predator === 0 && result.legacyFauna.apex === 0, 'Legacy hard-coded fauna returned during v48 performance smoke.');
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
