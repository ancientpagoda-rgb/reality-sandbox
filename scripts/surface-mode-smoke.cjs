const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_SURFACE_MODE_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'surface-mode-smoke');
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
      window.realitySandboxSurfaceMode &&
      window.realitySandboxSurfaceGpu?.installed &&
      window.realitySandboxSurfaceSphereV37?.installed &&
      window.realitySandboxSurfaceVegetationV38?.installed &&
      window.realitySandboxSurfaceWeatherV39?.installed &&
      window.realitySandboxSurfaceRiversV41?.installed
    ), null, { timeout: 120000 });

    // Regression for the actual user failure: old fauna initialization expired after
    // ~16.8 seconds because it incorrectly waited for a camera that only exists once
    // Surface Mode renders. Deliberately enter after that old timeout window.
    await page.waitForTimeout(18000);

    await page.click('#enterSurfaceMode');
    await page.waitForFunction(() => document.documentElement.dataset.surfaceMode === 'active' && window.realitySandboxSurfaceGpu?.isPresenting?.(), null, { timeout: 30000 });
    await page.waitForFunction(() => Boolean(
      window.realitySandboxSurfaceCreaturesV44?.installed &&
      window.realitySandboxEvolutionaryEcologyV45?.installed &&
      window.realitySandboxEcologicalMigrationV46?.installed &&
      window.realitySandboxSurfaceFaunaGuaranteeV46c?.installed
    ), null, { timeout: 60000 });

    await page.waitForFunction(() => {
      const e = window.realitySandboxEvolutionaryEcologyV45?.getStats?.();
      const m = window.realitySandboxEcologicalMigrationV46?.getStats?.();
      const f = window.realitySandboxSurfaceFaunaGuaranteeV46c?.getStats?.();
      return e?.ticks >= 3 && e?.organismsEvaluated > 0 && m?.ticks >= 2 && m?.speciesEvaluated > 0 &&
        f?.startupTimeoutRemoved === true && f?.cameraReady === true && f?.viewportSeeded === true &&
        f?.viewportAfter >= 5 && f?.updates >= 2 && f?.renderedAgents >= 5 &&
        f?.screenVisibleAgents >= 5 && f?.centralVisibleAgents >= 3 && f?.exactGroundSamples > 0;
    }, null, { timeout: 60000 });

    const beforePlayer = await page.evaluate(() => window.realitySandboxSurfaceMode.getPlayer());
    await page.keyboard.down('w');
    await page.waitForTimeout(850);
    await page.keyboard.up('w');
    await page.waitForTimeout(300);

    const after = await page.evaluate(() => {
      const c = window.realitySandboxPlanet.world.ecs.components;
      let sample = null;
      for (const [role, map] of [['agent', c.agent], ['predator', c.predator], ['apex', c.apex]]) {
        const first = map.entries().next();
        if (first.done) continue;
        const [id, organism] = first.value;
        sample = {
          id,
          role,
          habitatFitness: organism.habitatFitness,
          selectionPressure: organism.selectionPressure,
          fertilityCredit: organism.fertilityCredit,
          preferredTemperature: organism.preferredTemperature,
          moisturePreference: organism.moisturePreference,
          elevationPreference: organism.elevationPreference,
          waterAffinity: organism.waterAffinity,
          migrationActive: organism.migrationActive,
          migrationReason: organism.migrationReason,
          migrationPressure: organism.migrationPressure,
          species: window.realitySandboxEvolutionaryEcologyV45.getSpeciesForEntity(id),
        };
        break;
      }
      return {
        player: window.realitySandboxSurfaceMode.getPlayer(),
        build: window.realitySandboxSurfaceBuild,
        surface: window.realitySandboxSurfaceSphereV37.getStats(),
        creatures: window.realitySandboxSurfaceCreaturesV44.getStats(),
        faunaGuarantee: window.realitySandboxSurfaceFaunaGuaranteeV46c.getStats(),
        evolution: window.realitySandboxEvolutionaryEcologyV45.getStats(),
        migration: window.realitySandboxEcologicalMigrationV46.getStats(),
        migrations: window.realitySandboxEcologicalMigrationV46.getMigrations(),
        species: window.realitySandboxEvolutionaryEcologyV45.getSpecies(),
        ancestry: window.realitySandboxEvolutionaryEcologyV45.getAncestry(),
        sample,
        weather: window.realitySandboxSurfaceWeatherV39.getStats(),
        vegetation: window.realitySandboxSurfaceVegetationV38.getStats(),
        rivers: window.realitySandboxSurfaceRiversV41.getStats(),
      };
    });

    const moved = Math.hypot(after.player.x - beforePlayer.x, after.player.y - beforePlayer.y);
    assert(after.build === 'surface-v46c-screen-verified-fauna', `Unexpected build ${after.build}`);
    assert(moved > 2, `Surface movement smoke check failed (${moved}).`);
    assert(after.surface.curvatureRadius >= 26000 && after.surface.renderLoopProceduralSamples === 0, 'Large-planet terrain baseline regressed.');
    assert(after.creatures.spatialHash === true && after.creatures.quadraticNeighborScans === false, 'Creature spatial hash is not active.');
    assert(after.creatures.globalPopulationCap === false && after.creatures.globalDisplayCap === false, 'Creature cap policy regressed.');

    assert(after.faunaGuarantee.startupTimeoutRemoved === true && after.faunaGuarantee.lazyCameraAcquisition === true, 'Fauna startup-race fix is inactive.');
    assert(after.faunaGuarantee.viewportSeeded === true && after.faunaGuarantee.viewportAfter >= 5, 'Screen-verified real-fauna herd was not established.');
    assert(after.faunaGuarantee.renderedAgents >= 5, `Too few grounded near herbivores rendered (${after.faunaGuarantee.renderedAgents}).`);
    assert(after.faunaGuarantee.screenSpaceVerified === true && after.faunaGuarantee.screenVisibleAgents >= 5, `Too few herbivores project into the viewport (${after.faunaGuarantee.screenVisibleAgents}).`);
    assert(after.faunaGuarantee.centralVisibleAgents >= 3, `No reliable central-view herd (${after.faunaGuarantee.centralVisibleAgents}).`);
    assert(after.faunaGuarantee.exactRenderedTerrainGrounding === true && after.faunaGuarantee.exactGroundSamples > 0, 'Fauna are not grounded against the rendered terrain mesh.');
    assert(after.faunaGuarantee.unlitReadableMorphology === true && after.faunaGuarantee.gpuInstancing === true, 'Readable grounded GPU fauna path is inactive.');
    assert(after.faunaGuarantee.globalPopulationCap === false && after.faunaGuarantee.globalDisplayCap === false, 'Grounded fauna repair introduced a cap.');
    assert(after.faunaGuarantee.proceduralSamplingInRenderLoop === false && after.faunaGuarantee.renderLoopProceduralSamples === 0, 'Grounded fauna repair performs render-loop procedural sampling.');

    assert(after.evolution.habitatDrivenPopulations === true && after.evolution.directHabitatFitness === true, 'v45 habitat-driven population model is inactive.');
    assert(after.evolution.habitatAffectsEnergyCost === true && after.evolution.habitatAffectsReproductiveOpportunity === true, 'v45 habitat selection no longer feeds survival/reproduction.');
    assert(after.evolution.randomSpeciation === false, 'Random speciation path returned.');
    assert(after.evolution.speciationRequiresGeneticDivergence === true && after.evolution.speciationRequiresNicheDivergence === true, 'v45 divergence gates regressed.');
    assert(after.evolution.speciationRequiresGeographicIsolation === true && after.evolution.speciationRequiresPersistence === true, 'v45 isolation/persistence gates regressed.');
    assert(after.evolution.proceduralSamplingInRenderLoop === false && after.evolution.renderLoopProceduralSamples === 0, 'v45 performs render-loop sampling.');

    assert(after.migration.migrationEnabled === true && after.migration.speciesLevelMigration === true, 'Species-level migration is inactive.');
    assert(after.migration.seasonalTemperatureMigration === true, 'Seasonal migration trigger missing.');
    assert(after.migration.droughtMigration === true && after.migration.floodMigration === true, 'Water-driven migration triggers missing.');
    assert(after.migration.foodScarcityMigration === true && after.migration.crowdingMigration === true, 'Scarcity/crowding migration triggers missing.');
    assert(after.migration.herdCohesion === true && after.migration.dynamicMigrationTargets === true, 'Coherent herd migration path missing.');
    assert(after.migration.migrationTargetsRequireImprovement === true, 'Migration can target non-improving habitat.');
    assert(after.migration.habitatSelectionInheritedFromV45 === true, 'v46 is not coupled to v45 habitat selection.');
    assert(after.migration.speciesEvaluated > 0 && after.migration.meanMigrationPressure >= 0 && after.migration.meanMigrationPressure <= 1, 'Migration pressure evaluation failed.');
    assert(after.migration.maxMigrationPressure >= 0 && after.migration.maxMigrationPressure <= 1, 'Maximum migration pressure is invalid.');
    assert(after.migration.globalPopulationCap === false && after.migration.globalDisplayCap === false, 'Migration introduced a population/display cap.');
    assert(after.migration.proceduralSamplingInRenderLoop === false && after.migration.renderLoopProceduralSamples === 0, 'Migration performs render-loop sampling.');

    assert(after.sample && Number.isFinite(after.sample.habitatFitness), 'No organism received habitat fitness.');
    assert(after.sample.species?.id, 'Organism was not assigned to a v45 lineage.');

    assert(after.weather.renderLoopProceduralSamples === 0, 'Weather render-loop sampling regressed.');
    assert(after.vegetation.renderLoopProceduralSamples === 0, 'Vegetation render-loop sampling regressed.');
    assert(after.rivers.renderLoopProceduralSamples === 0, 'River render-loop sampling regressed.');
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    await page.screenshot({ path: path.join(artifactDir, 'surface-mode-v46c-screen-verified-fauna.png'), fullPage: true });
    fs.writeFileSync(path.join(artifactDir, 'surface-mode.json'), JSON.stringify({ beforePlayer, after, moved, pageErrors }, null, 2));
    await page.evaluate(() => window.realitySandboxSurfaceMode.exit());
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
