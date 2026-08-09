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

    await page.click('#enterSurfaceMode');
    await page.waitForFunction(() => document.documentElement.dataset.surfaceMode === 'active' && window.realitySandboxSurfaceGpu?.isPresenting?.(), null, { timeout: 30000 });
    await page.waitForFunction(() => Boolean(
      window.realitySandboxSurfaceCreaturesV44?.installed &&
      window.realitySandboxEvolutionaryEcologyV45?.installed
    ), null, { timeout: 60000 });

    await page.waitForFunction(() => {
      const e = window.realitySandboxEvolutionaryEcologyV45?.getStats?.();
      return e?.ticks >= 3 && e?.organismsEvaluated > 0 && e?.habitatSamples > 0 && e?.speciesAssignments > 0;
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
          species: window.realitySandboxEvolutionaryEcologyV45.getSpeciesForEntity(id),
        };
        break;
      }
      return {
        player: window.realitySandboxSurfaceMode.getPlayer(),
        build: window.realitySandboxSurfaceBuild,
        surface: window.realitySandboxSurfaceSphereV37.getStats(),
        creatures: window.realitySandboxSurfaceCreaturesV44.getStats(),
        evolution: window.realitySandboxEvolutionaryEcologyV45.getStats(),
        species: window.realitySandboxEvolutionaryEcologyV45.getSpecies(),
        ancestry: window.realitySandboxEvolutionaryEcologyV45.getAncestry(),
        sample,
        weather: window.realitySandboxSurfaceWeatherV39.getStats(),
        vegetation: window.realitySandboxSurfaceVegetationV38.getStats(),
        rivers: window.realitySandboxSurfaceRiversV41.getStats(),
      };
    });

    const moved = Math.hypot(after.player.x - beforePlayer.x, after.player.y - beforePlayer.y);
    assert(after.build === 'surface-v45-habitat-selection-speciation', `Unexpected build ${after.build}`);
    assert(moved > 2, `Surface movement smoke check failed (${moved}).`);
    assert(after.surface.curvatureRadius >= 26000 && after.surface.renderLoopProceduralSamples === 0, 'Large-planet terrain baseline regressed.');
    assert(after.creatures.spatialHash === true && after.creatures.quadraticNeighborScans === false, 'Creature spatial hash is not active.');
    assert(after.creatures.globalPopulationCap === false && after.creatures.globalDisplayCap === false, 'Creature cap policy regressed.');

    assert(after.evolution.habitatDrivenPopulations === true && after.evolution.directHabitatFitness === true, 'Habitat-driven population model is inactive.');
    assert(after.evolution.habitatAffectsEnergyCost === true && after.evolution.habitatAffectsReproductiveOpportunity === true, 'Habitat is not feeding survival/reproduction.');
    assert(after.evolution.localHabitatSteering === true && after.evolution.realSelectionPressure === true, 'Habitat selection pressure is inactive.');
    assert(after.evolution.randomSpeciation === false, 'Random speciation path returned.');
    assert(after.evolution.speciationRequiresGeneticDivergence === true, 'Genetic-divergence speciation gate missing.');
    assert(after.evolution.speciationRequiresNicheDivergence === true, 'Niche-divergence speciation gate missing.');
    assert(after.evolution.speciationRequiresGeographicIsolation === true, 'Geographic-isolation speciation gate missing.');
    assert(after.evolution.speciationRequiresPersistence === true && after.evolution.persistentIsolationCycles >= 3, 'Persistent isolation gate missing.');
    assert(after.evolution.activeOrganisms > 0 && after.evolution.livingSpecies >= 3, 'Evolutionary species registry did not initialize.');
    assert(after.evolution.meanHabitatFitness >= 0 && after.evolution.meanHabitatFitness <= 1, 'Mean habitat fitness is invalid.');
    assert(after.evolution.globalPopulationCap === false && after.evolution.globalDisplayCap === false, 'Evolutionary ecology introduced a population/display cap.');
    assert(after.evolution.proceduralSamplingInRenderLoop === false && after.evolution.renderLoopProceduralSamples === 0, 'Evolutionary ecology performs render-loop sampling.');

    assert(after.sample && Number.isFinite(after.sample.habitatFitness), 'No organism received habitat fitness.');
    assert(after.sample.habitatFitness >= 0 && after.sample.habitatFitness <= 1, 'Organism habitat fitness is out of range.');
    assert(Number.isFinite(after.sample.selectionPressure) && Number.isFinite(after.sample.fertilityCredit), 'Selection/reproductive state missing from organism.');
    assert(Number.isFinite(after.sample.preferredTemperature) && Number.isFinite(after.sample.moisturePreference) && Number.isFinite(after.sample.elevationPreference), 'Adaptive niche traits are missing.');
    assert(after.sample.species?.id, 'Organism was not assigned to a v45 lineage.');

    assert(after.weather.renderLoopProceduralSamples === 0, 'Weather render-loop sampling regressed.');
    assert(after.vegetation.renderLoopProceduralSamples === 0, 'Vegetation render-loop sampling regressed.');
    assert(after.rivers.renderLoopProceduralSamples === 0, 'River render-loop sampling regressed.');
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    await page.screenshot({ path: path.join(artifactDir, 'surface-mode-v45-habitat-selection-speciation.png'), fullPage: true });
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
