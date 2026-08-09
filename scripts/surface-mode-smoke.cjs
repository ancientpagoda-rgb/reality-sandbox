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
      window.realitySandboxSurfaceVegetationStabilityV38b?.installed &&
      window.realitySandboxSurfaceWeatherV39?.installed &&
      window.realitySandboxSurfaceOssV40?.installed &&
      window.realitySandboxSurfaceRiversV41?.installed &&
      window.realitySandboxSurfaceCreaturesV44?.installed &&
      window.realitySandboxSurfaceLargePlanetCoverageV43?.installed &&
      window.realitySandboxSurfaceGpuBackend?.installed
    ), null, { timeout: 120000 });

    await page.click('#enterSurfaceMode');
    await page.waitForFunction(() => document.documentElement.dataset.surfaceMode === 'active' && window.realitySandboxSurfaceGpu?.isPresenting?.(), null, { timeout: 30000 });

    await page.waitForFunction(() => window.realitySandboxSurfaceSphereV37?.getStats?.().nearBuildsCompleted >= 1, null, { timeout: 60000 });
    await page.waitForFunction(() => window.realitySandboxSurfaceVegetationV38?.getStats?.().buildsCompleted >= 1, null, { timeout: 120000 });
    await page.waitForFunction(() => window.realitySandboxSurfaceWeatherV39?.getStats?.().buildsCompleted >= 1, null, { timeout: 120000 });
    await page.waitForFunction(() => window.realitySandboxSurfaceOssV40?.getStats?.().skirtsBuilt >= 1, null, { timeout: 60000 });
    await page.waitForFunction(() => window.realitySandboxSurfaceRiversV41?.getStats?.().buildsCompleted >= 1, null, { timeout: 120000 });
    await page.waitForFunction(() => {
      const c = window.realitySandboxSurfaceCreaturesV44?.getStats?.();
      return c?.simulationTicks >= 3 && c?.renderUpdates >= 3 && c?.population > 0 && c?.spatialQueries > 0;
    }, null, { timeout: 60000 });

    const before = await page.evaluate(() => ({
      player: window.realitySandboxSurfaceMode.getPlayer(),
      sky: window.realitySandboxSurfaceCelestialsV38.getStats(),
      rivers: window.realitySandboxSurfaceRiversV41.getStats(),
      creatures: window.realitySandboxSurfaceCreaturesV44.getStats(),
      coverage: window.realitySandboxSurfaceLargePlanetCoverageV43.getStats(),
    }));

    await page.keyboard.press('t');
    await page.waitForTimeout(260);
    const fastSky = await page.evaluate(() => window.realitySandboxSurfaceCelestialsV38.getStats());
    await page.keyboard.press('t');

    await page.keyboard.down('Shift');
    await page.keyboard.down('Space');
    await page.waitForTimeout(1500);
    await page.keyboard.up('Space');
    await page.keyboard.up('Shift');
    await page.waitForFunction(() => window.realitySandboxSurfaceMode.getPlayer().altitude > 700, null, { timeout: 10000 });
    await page.waitForFunction(() => {
      const c = window.realitySandboxSurfaceLargePlanetCoverageV43?.getStats?.();
      return c?.buildsCompleted >= 1 && c?.visible === true;
    }, null, { timeout: 120000 });

    await page.keyboard.down('w');
    await page.waitForTimeout(2400);
    await page.keyboard.up('w');
    await page.waitForTimeout(1200);

    await page.waitForFunction(() => {
      const c = window.realitySandboxSurfaceCreaturesV44?.getStats?.();
      return c && c.renderedAgents + c.renderedPredators + c.renderedApex === c.population;
    }, null, { timeout: 30000 });

    const after = await page.evaluate(() => ({
      player: window.realitySandboxSurfaceMode.getPlayer(),
      build: window.realitySandboxSurfaceBuild,
      controller: window.realitySandboxSurfaceMode.getStats?.(),
      surface: window.realitySandboxSurfaceSphereV37.getStats(),
      flight: window.realitySandboxSurfaceFlightV38.getStats(),
      sky: window.realitySandboxSurfaceCelestialsV38.getStats(),
      solar: window.realitySandboxSurfaceSolarLightingV36.getStats(),
      water: window.realitySandboxSurfaceWaterStabilityV38b.getStats(),
      vegetation: window.realitySandboxSurfaceVegetationV38.getStats(),
      vegetationStability: window.realitySandboxSurfaceVegetationStabilityV38b.getStats(),
      weather: window.realitySandboxSurfaceWeatherV39.getStats(),
      oss: window.realitySandboxSurfaceOssV40.getStats(),
      rivers: window.realitySandboxSurfaceRiversV41.getStats(),
      creatures: window.realitySandboxSurfaceCreaturesV44.getStats(),
      coverage: window.realitySandboxSurfaceLargePlanetCoverageV43.getStats(),
      diagnostics: window.realitySandboxPresentationDiagnostics(),
    }));

    const moved = Math.hypot(after.player.x - before.player.x, after.player.y - before.player.y);
    assert(after.build === 'surface-v44-spatial-gpu-creatures', `Unexpected build ${after.build}`);
    assert(after.controller?.topology === 'sphere' && after.controller?.extendedFlight, 'Spherical extended flight regressed.');
    assert(after.surface.curvatureRadius >= 26000 && after.surface.presentationScaleMultiplier >= 9.9, '10x presentation scale regressed.');
    assert(after.player.altitude > 700 && after.flight.maxAltitude >= 4000 && after.flight.cameraFar >= 40000, 'Large-planet high flight regressed.');
    assert(after.flight.largePlanetFlight === true && after.flight.altitudeScaleMultiplier > 8, 'Large-planet flight contract missing.');
    assert(before.sky.timeMode === 'stable' && fastSky.timeLapseEnabled === true && after.sky.timeLapseEnabled === false, 'Sky time-lapse toggle regressed.');
    assert(after.solar.sunDirectionCoupled && after.solar.sunBrightnessCoupled && after.solar.shadowsEnabled === false, 'Solar coupling regressed.');

    assert(after.surface.renderLoopProceduralSamples === 0 && after.surface.bestAvailableRefinement && after.surface.viewPriorityEnabled, 'Terrain streaming/performance regressed.');
    assert(after.water.geometryWaves === false && after.water.fragmentWaves === true && after.water.worldSpaceWaves === true, 'Stable water regressed.');
    assert(after.vegetation.gpuInstancing && after.vegetation.renderLoopProceduralSamples === 0, 'Vegetation GPU/performance regressed.');
    assert(after.vegetationStability.anchorRegistered && after.vegetationStability.instancedFrustumCullingDisabled, 'Vegetation stability regressed.');
    assert(after.weather.cachedField && after.weather.bilinearInterpolation && after.weather.renderLoopProceduralSamples === 0, 'Cached weather regressed.');
    assert(after.oss.screenSpaceErrorEnabled && after.oss.sphericalHorizonCulling && after.oss.terrainSkirts, 'v40 OSS globe consolidation regressed.');

    assert(after.rivers.graphPrecomputed === true && after.rivers.graphTraces > 0 && after.rivers.ribbonsBuilt > 0, 'River network regressed.');
    assert(after.rivers.hydrologySamplesInRenderLoop === 0 && after.rivers.terrainSamplesInRenderLoop === 0, 'River render loop performs procedural sampling.');

    assert(after.creatures.spatialHash === true && after.creatures.quadraticNeighborScans === false, 'Creature ecology is not using the spatial hash path.');
    assert(after.creatures.spatialRebuilds >= after.creatures.simulationTicks && after.creatures.spatialQueries > 20, 'Spatial creature neighbor queries did not run.');
    assert(after.creatures.distanceAwareSimulation === true && after.creatures.simulationHz === 8 && after.creatures.farDecisionHz < after.creatures.nearDecisionHz, 'Distance-aware creature simulation contract failed.');
    assert(after.creatures.gpuInstancing === true && after.creatures.dynamicInstanceCapacity === true && after.creatures.lowPolyMorphology === true && after.creatures.dnaDrivenMorphology === true, 'GPU creature morphology path is not active.');
    assert(after.creatures.globalPopulationCap === false && after.creatures.globalDisplayCap === false, 'Creature population/display cap was introduced.');
    assert(after.creatures.population > 0 && after.creatures.renderedAgents + after.creatures.renderedPredators + after.creatures.renderedApex === after.creatures.population, 'Not every living creature is represented by the GPU instance layer.');
    assert(after.creatures.terrainSamplingInRenderLoop === false && after.creatures.renderLoopProceduralSamples === 0, 'Creature renderer performs terrain sampling in the render loop.');
    assert(after.creatures.terrainSamples > 0 && after.creatures.terrainCacheSize > 0, 'Creature terrain cache was not populated.');
    assert(after.creatures.simulationTicks > before.creatures.simulationTicks, 'Creature ecology did not advance while Surface Mode was active.');

    assert(after.coverage.curvatureRadius >= 26000 && after.coverage.macroRadius >= 18000, 'Macro globe coverage scale is too small.');
    assert(after.coverage.circularCoverage === true && after.coverage.mergedSingleMesh === true, 'Macro coverage is not the circular single-mesh path.');
    assert(after.coverage.buildsCompleted >= 1 && after.coverage.vertices > 2000 && after.coverage.triangles > 4000, 'Macro coverage did not build.');
    assert(after.coverage.lowAltitudeBuildDeferred === true && before.coverage.buildsStarted === 0, 'Macro coverage should remain deferred near the ground.');
    assert(after.coverage.proceduralSamplingInRenderLoop === false && after.coverage.renderLoopProceduralSamples === 0, 'Macro coverage samples terrain in the render loop.');
    assert(after.coverage.cameraFar >= 40000, 'Macro coverage camera range is too short.');

    assert(after.diagnostics.surfaceGpu?.gpuPrimary === true, 'GPU surface renderer is not primary.');
    assert(after.diagnostics.surfaceGpuBackend?.renderer, 'GPU backend diagnostics missing.');
    assert(moved > 20, `Movement did not exercise chunk handoff (${moved}).`);
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    await page.screenshot({ path: path.join(artifactDir, 'surface-mode-v44-spatial-gpu-creatures.png'), fullPage: true });
    fs.writeFileSync(path.join(artifactDir, 'surface-mode.json'), JSON.stringify({ before, fastSky, after, pageErrors }, null, 2));
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
