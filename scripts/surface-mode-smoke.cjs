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
      window.realitySandboxSurfaceFlightV38?.installed &&
      window.realitySandboxSurfaceCelestialsV38?.installed &&
      window.realitySandboxSurfaceSolarLightingV36?.installed &&
      window.realitySandboxSurfaceWaterStabilityV38b?.installed &&
      window.realitySandboxSurfaceVegetationV38?.installed &&
      window.realitySandboxSurfaceWeatherV39?.installed &&
      window.realitySandboxSurfaceOssV40?.installed &&
      window.realitySandboxSurfaceRiversV41?.installed &&
      window.realitySandboxSurfaceLargePlanetCoverageV43?.installed
    ), null, { timeout: 120000 });

    await page.click('#enterSurfaceMode');
    await page.waitForFunction(() => document.documentElement.dataset.surfaceMode === 'active' && window.realitySandboxSurfaceGpu?.isPresenting?.(), null, { timeout: 30000 });

    await page.waitForFunction(() => Boolean(
      window.realitySandboxSurfaceCreaturesV44?.installed &&
      window.realitySandboxSurfaceLocalFaunaV44d?.installed &&
      window.realitySandboxSurfaceCreatureVisibilityV44b?.installed &&
      window.realitySandboxSurfaceCreatureReadabilityV44c?.installed
    ), null, { timeout: 60000 });

    await page.waitForFunction(() => {
      const c = window.realitySandboxSurfaceCreaturesV44?.getStats?.();
      const f = window.realitySandboxSurfaceLocalFaunaV44d?.getStats?.();
      const r = window.realitySandboxSurfaceCreatureReadabilityV44c?.getStats?.();
      return c?.population > 0 && c?.renderUpdates >= 3 && c?.spatialQueries > 0 && f?.seeded === true && f?.nearbyAfter >= 20 && r?.updates >= 2 && r?.glintPoints > 0 && Number.isFinite(r?.nearestCreatureDistance) && r.nearestCreatureDistance < 350;
    }, null, { timeout: 60000 });

    const after = await page.evaluate(() => ({
      build: window.realitySandboxSurfaceBuild,
      surface: window.realitySandboxSurfaceSphereV37.getStats(),
      creatures: window.realitySandboxSurfaceCreaturesV44.getStats(),
      localFauna: window.realitySandboxSurfaceLocalFaunaV44d.getStats(),
      visibility: window.realitySandboxSurfaceCreatureVisibilityV44b.getStats(),
      readability: window.realitySandboxSurfaceCreatureReadabilityV44c.getStats(),
      weather: window.realitySandboxSurfaceWeatherV39.getStats(),
      vegetation: window.realitySandboxSurfaceVegetationV38.getStats(),
      rivers: window.realitySandboxSurfaceRiversV41.getStats(),
    }));

    assert(after.build === 'surface-v44d-local-fauna-visible', `Unexpected build ${after.build}`);
    assert(after.surface.curvatureRadius >= 26000 && after.surface.renderLoopProceduralSamples === 0, 'Large-planet terrain baseline regressed.');
    assert(after.creatures.spatialHash === true && after.creatures.quadraticNeighborScans === false, 'Creature spatial hash is not active.');
    assert(after.creatures.gpuInstancing === true && after.creatures.globalPopulationCap === false && after.creatures.globalDisplayCap === false, 'Creature GPU/no-cap policy regressed.');
    assert(after.creatures.population > 0 && after.creatures.renderedAgents + after.creatures.renderedPredators + after.creatures.renderedApex === after.creatures.population, 'Not every living creature has a body instance.');
    assert(after.creatures.renderLoopProceduralSamples === 0 && after.creatures.terrainSamplingInRenderLoop === false, 'Creature renderer performs procedural sampling.');

    assert(after.localFauna.seeded === true && after.localFauna.oneTimePerWorld === true && after.localFauna.recurringTopUp === false, 'Local fauna one-time seed did not complete.');
    assert(after.localFauna.realEcsCreatures === true && after.localFauna.nearbyAfter >= 20, `Local fauna remains too sparse (${after.localFauna.nearbyAfter}).`);
    assert(after.localFauna.globalPopulationCap === false && after.localFauna.globalDisplayCap === false && after.localFauna.renderLoopProceduralSamples === 0, 'Local fauna seed introduced a cap or render-loop sampling.');

    assert(after.visibility.matricesEnhanced > 0 && after.visibility.materialsEnhanced > 0, 'Readable body enhancer did not touch creature meshes.');
    assert(after.visibility.agentScale >= 3.5 && after.visibility.predatorScale >= 4 && after.visibility.apexScale >= 4.5, 'Creature body scale enhancement regressed.');

    assert(after.readability.actualCreaturePositions === true && after.readability.glintPoints > 0, 'Far-fauna readability layer has no creature points.');
    assert(after.readability.depthTested === true && after.readability.singleAdditionalDrawCall === true && after.readability.additionalDrawCalls === 1, 'Fauna glint draw-path contract failed.');
    assert(Number.isFinite(after.readability.nearestCreatureDistance) && after.readability.nearestCreatureDistance < 350, `Nearest visible creature is unexpectedly far (${after.readability.nearestCreatureDistance}).`);
    assert(after.readability.globalDisplayCap === false && after.readability.renderLoopProceduralSamples === 0, 'Fauna readability layer introduced a cap or procedural sampling.');

    assert(after.weather.renderLoopProceduralSamples === 0, 'Weather render-loop sampling regressed.');
    assert(after.vegetation.renderLoopProceduralSamples === 0, 'Vegetation render-loop sampling regressed.');
    assert(after.rivers.renderLoopProceduralSamples === 0, 'River render-loop sampling regressed.');
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    await page.screenshot({ path: path.join(artifactDir, 'surface-mode-v44d-local-fauna-visible.png'), fullPage: true });
    fs.writeFileSync(path.join(artifactDir, 'surface-mode.json'), JSON.stringify({ after, pageErrors }, null, 2));
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
