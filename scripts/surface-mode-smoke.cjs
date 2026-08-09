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
      window.realitySandboxSurfaceGpuBackend?.installed
    ), null, { timeout: 120000 });

    await page.click('#enterSurfaceMode');
    await page.waitForFunction(() => document.documentElement.dataset.surfaceMode === 'active' && window.realitySandboxSurfaceGpu?.isPresenting?.(), null, { timeout: 30000 });

    await page.waitForFunction(() => window.realitySandboxSurfaceSphereV37?.getStats?.().nearBuildsCompleted >= 1, null, { timeout: 60000 });
    await page.waitForFunction(() => window.realitySandboxSurfaceVegetationV38?.getStats?.().buildsCompleted >= 1, null, { timeout: 120000 });
    await page.waitForFunction(() => window.realitySandboxSurfaceWeatherV39?.getStats?.().buildsCompleted >= 1, null, { timeout: 120000 });
    await page.waitForFunction(() => window.realitySandboxSurfaceOssV40?.getStats?.().skirtsBuilt >= 1, null, { timeout: 60000 });
    await page.waitForFunction(() => window.realitySandboxSurfaceRiversV41?.getStats?.().buildsCompleted >= 1, null, { timeout: 120000 });

    const before = await page.evaluate(() => ({
      player: window.realitySandboxSurfaceMode.getPlayer(),
      sky: window.realitySandboxSurfaceCelestialsV38.getStats(),
      rivers: window.realitySandboxSurfaceRiversV41.getStats(),
    }));

    await page.keyboard.press('t');
    await page.waitForTimeout(260);
    const fastSky = await page.evaluate(() => window.realitySandboxSurfaceCelestialsV38.getStats());
    await page.keyboard.press('t');

    await page.keyboard.down('Shift');
    await page.keyboard.down('Space');
    await page.waitForTimeout(1050);
    await page.keyboard.up('Space');
    await page.keyboard.up('Shift');
    await page.waitForFunction(() => window.realitySandboxSurfaceMode.getPlayer().altitude > 100, null, { timeout: 10000 });

    await page.keyboard.down('w');
    await page.waitForTimeout(2400);
    await page.keyboard.up('w');
    await page.waitForTimeout(1200);

    await page.waitForFunction(() => window.realitySandboxSurfaceWeatherV39?.getStats?.().buildsCompleted >= 2, null, { timeout: 120000 });
    await page.waitForFunction(() => window.realitySandboxSurfaceRiversV41?.getStats?.().buildsCompleted >= 2 || window.realitySandboxSurfaceRiversV41?.getStats?.().cacheHits >= 1, null, { timeout: 120000 });

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
      diagnostics: window.realitySandboxPresentationDiagnostics(),
    }));

    const moved = Math.hypot(after.player.x - before.player.x, after.player.y - before.player.y);
    assert(after.build === 'surface-v41-continuous-river-network', `Unexpected build ${after.build}`);
    assert(after.controller?.topology === 'sphere' && after.controller?.extendedFlight, 'Spherical extended flight regressed.');
    assert(after.player.altitude > 100 && after.flight.maxAltitude >= 400, 'High flight regressed.');
    assert(before.sky.timeMode === 'stable' && fastSky.timeLapseEnabled === true && after.sky.timeLapseEnabled === false, 'Sky time-lapse toggle regressed.');
    assert(after.solar.sunDirectionCoupled && after.solar.sunBrightnessCoupled && after.solar.shadowsEnabled === false, 'Solar coupling regressed.');

    assert(after.surface.renderLoopProceduralSamples === 0 && after.surface.bestAvailableRefinement && after.surface.viewPriorityEnabled, 'Terrain streaming/performance regressed.');
    assert(after.water.geometryWaves === false && after.water.fragmentWaves === true && after.water.worldSpaceWaves === true, 'Stable water regressed.');
    assert(after.water.wetDryBridgeTrianglesRemoved && after.water.steepInlandWaterRejected, 'Water slope filtering regressed.');
    assert(after.vegetation.gpuInstancing && after.vegetation.renderLoopProceduralSamples === 0, 'Vegetation GPU/performance regressed.');
    assert(after.vegetationStability.anchorRegistered && after.vegetationStability.instancedFrustumCullingDisabled, 'Vegetation stability regressed.');
    assert(after.weather.cachedField && after.weather.bilinearInterpolation && after.weather.renderLoopProceduralSamples === 0, 'Cached weather regressed.');

    assert(after.oss.screenSpaceErrorEnabled && after.oss.sphericalHorizonCulling && after.oss.terrainSkirts, 'v40 OSS globe consolidation regressed.');
    assert(after.oss.atmosphereShell && after.oss.atmosphereSunCoupled && after.oss.globalDisplayCap === false, 'Atmosphere/uncapped policy regressed.');

    assert(after.rivers.graphPrecomputed === true && after.rivers.graphTraces > 0 && after.rivers.graphEdges > 0, 'River drainage graph was not constructed.');
    assert(after.rivers.continuousDownhillChannels === true && after.rivers.tributaryConfluences === true, 'River topology contract failed.');
    assert(after.rivers.ribbonsBuilt > 0 && after.rivers.vertices > 0 && after.rivers.triangles > 0, 'No river ribbon geometry was built.');
    assert(after.rivers.cachedChunkGeometry === true && after.rivers.cacheLimit === 4 && after.rivers.cacheSize <= 4, 'River LRU cache contract failed.');
    assert(after.rivers.animatedFlowShader === true, 'River flow shader is not active.');
    assert(after.rivers.hydrologySamplesInRenderLoop === 0 && after.rivers.terrainSamplesInRenderLoop === 0 && after.rivers.renderLoopProceduralSamples === 0, 'River render loop performs procedural sampling.');
    assert(after.rivers.globalDisplayCap === false, 'River renderer introduced a global display cap.');

    assert(after.diagnostics.surfaceGpu?.gpuPrimary === true, 'GPU surface renderer is not primary.');
    assert(after.diagnostics.surfaceGpuBackend?.renderer, 'GPU backend diagnostics missing.');
    assert(moved > 20, `Movement did not exercise chunk handoff (${moved}).`);
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    await page.screenshot({ path: path.join(artifactDir, 'surface-mode-v41-rivers.png'), fullPage: true });
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
