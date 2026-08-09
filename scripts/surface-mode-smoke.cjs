const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_SURFACE_MODE_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'surface-mode-smoke');
fs.mkdirSync(artifactDir, { recursive: true });

(async () => {
  const executablePath = process.env.REALITY_CHROMIUM_PATH;
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
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
      window.realitySandboxSurfaceCpuRelief?.installed &&
      window.realitySandboxSurfaceIdleSchedulerV34?.installed &&
      window.realitySandboxSurfaceLightHookV36?.installed &&
      window.realitySandboxSurfaceWaterStabilityV38b?.installed &&
      window.realitySandboxSurfaceOssV40?.installed &&
      window.realitySandboxSurfaceFlightV38?.installed &&
      window.realitySandboxSurfaceSphereV37?.installed &&
      window.realitySandboxSurfaceCelestialsV38?.installed &&
      window.realitySandboxSurfaceSolarLightingV36?.installed &&
      window.realitySandboxSurfaceVegetationV38?.installed &&
      window.realitySandboxSurfaceVegetationStabilityV38b?.installed &&
      window.realitySandboxSurfaceHorizonV38?.installed &&
      window.realitySandboxSurfaceWeatherV39?.installed &&
      window.realitySandboxSurfaceGpuBackend?.installed &&
      document.getElementById('enterSurfaceMode') &&
      document.getElementById('surfaceGpuCanvas') &&
      document.getElementById('surfaceCelestialCanvas')
    ), null, { timeout: 120000 });

    await page.click('#enterSurfaceMode');
    await page.waitForFunction(() => (
      document.documentElement.dataset.surfaceMode === 'active' &&
      document.documentElement.dataset.surfaceGpu === 'active' &&
      window.realitySandboxSurfaceGpu?.isPresenting?.()
    ), null, { timeout: 30000 });

    await page.waitForFunction(() => (
      window.realitySandboxSurfaceSphereV37?.getStats?.().nearBuildsCompleted >= 1 &&
      window.realitySandboxSurfaceCelestialsV38?.getStats?.().updates >= 2 &&
      window.realitySandboxSurfaceSolarLightingV36?.getStats?.().updates >= 2
    ), null, { timeout: 60000 });

    await page.waitForFunction(() => window.realitySandboxSurfaceVegetationV38?.getStats?.().buildsCompleted >= 1, null, { timeout: 120000 });
    await page.waitForFunction(() => window.realitySandboxSurfaceWaterStabilityV38b?.getStats?.().meshesProcessed >= 1, null, { timeout: 60000 });
    await page.waitForFunction(() => {
      const w = window.realitySandboxSurfaceWeatherV39?.getStats?.();
      return w?.buildsCompleted >= 1 && w?.fieldReady && w?.particleFrames >= 2;
    }, null, { timeout: 120000 });
    await page.waitForFunction(() => {
      const o = window.realitySandboxSurfaceOssV40?.getStats?.();
      return o?.skirtsBuilt >= 1 && o?.screenSpaceErrorSamples >= 2 && o?.atmosphereShell === true;
    }, null, { timeout: 60000 });

    const stable = await page.evaluate(() => ({
      player: window.realitySandboxSurfaceMode.getPlayer(),
      surface: window.realitySandboxSurfaceSphereV37.getStats(),
      sky: window.realitySandboxSurfaceCelestialsV38.getStats(),
      vegetation: window.realitySandboxSurfaceVegetationV38.getStats(),
      weather: window.realitySandboxSurfaceWeatherV39.getStats(),
      oss: window.realitySandboxSurfaceOssV40.getStats(),
      waterStability: window.realitySandboxSurfaceWaterStabilityV38b.getStats(),
      vegetationStability: window.realitySandboxSurfaceVegetationStabilityV38b.getStats(),
      diagnostics: window.realitySandboxPresentationDiagnostics(),
    }));

    await page.keyboard.press('t');
    await page.waitForTimeout(260);
    const fastSky = await page.evaluate(() => window.realitySandboxSurfaceCelestialsV38.getStats());
    await page.keyboard.press('t');
    await page.waitForTimeout(120);

    await page.keyboard.down('Shift');
    await page.keyboard.down('Space');
    await page.waitForTimeout(1050);
    await page.keyboard.up('Space');
    await page.keyboard.up('Shift');

    await page.waitForFunction(() => window.realitySandboxSurfaceMode.getPlayer().altitude > 100, null, { timeout: 10000 });
    await page.waitForFunction(() => {
      const s = window.realitySandboxSurfaceSphereV37?.getStats?.();
      return s?.distantTilesVisible >= 8;
    }, null, { timeout: 120000 });
    await page.waitForFunction(() => window.realitySandboxSurfaceHorizonV38?.getStats?.().buildsCompleted >= 1, null, { timeout: 120000 });

    await page.keyboard.down('w');
    await page.waitForTimeout(2200);
    await page.keyboard.up('w');
    await page.waitForTimeout(900);

    await page.waitForFunction(() => window.realitySandboxSurfaceWeatherV39?.getStats?.().buildsCompleted >= 2, null, { timeout: 120000 });

    const after = await page.evaluate(() => ({
      player: window.realitySandboxSurfaceMode.getPlayer(),
      diagnostics: window.realitySandboxPresentationDiagnostics(),
      surface: window.realitySandboxSurfaceSphereV37.getStats(),
      sky: window.realitySandboxSurfaceCelestialsV38.getStats(),
      solar: window.realitySandboxSurfaceSolarLightingV36.getStats(),
      flight: window.realitySandboxSurfaceFlightV38.getStats(),
      vegetation: window.realitySandboxSurfaceVegetationV38.getStats(),
      vegetationStability: window.realitySandboxSurfaceVegetationStabilityV38b.getStats(),
      waterStability: window.realitySandboxSurfaceWaterStabilityV38b.getStats(),
      weather: window.realitySandboxSurfaceWeatherV39.getStats(),
      oss: window.realitySandboxSurfaceOssV40.getStats(),
      horizon: window.realitySandboxSurfaceHorizonV38.getStats(),
      scheduler: window.realitySandboxSurfaceIdleSchedulerV34.getStats(),
      controller: window.realitySandboxSurfaceMode.getStats?.(),
      active: window.realitySandboxSurfaceMode.isActive(),
      surfaceBuild: window.realitySandboxSurfaceBuild,
    }));

    await page.screenshot({ path: path.join(artifactDir, 'surface-mode-v40-oss-globe-consolidation.png'), fullPage: true });
    fs.writeFileSync(path.join(artifactDir, 'surface-mode.json'), JSON.stringify({ stable, fastSky, after, pageErrors }, null, 2));

    const moved = Math.hypot(after.player.x - stable.player.x, after.player.y - stable.player.y);
    assert(after.active, 'Surface mode did not remain active.');
    assert(after.surfaceBuild === 'surface-v40-oss-globe-consolidation', `Unexpected surface build: ${after.surfaceBuild}`);
    assert(after.controller?.topology === 'sphere' && after.controller?.extendedFlight === true, 'Extended spherical flight controller is not active.');
    assert(after.controller.maxAltitude >= 400 && after.player.altitude > 100, `High flight did not extend altitude (${after.player.altitude}).`);
    assert(after.flight.extendedFlight === true && after.flight.cameraFar >= 2500, 'High-flight far plane extension is not active.');

    assert(stable.sky.timeMode === 'stable' && stable.sky.celestialDaySeconds >= 600, 'Stable sky did not start in stable mode.');
    assert(fastSky.timeLapseEnabled === true && fastSky.timeMode === 'timelapse', 'T did not enable time-lapse sky.');
    assert(fastSky.timeScaleDaysPerSecond >= 2 && fastSky.celestialDaySeconds < 1, 'Time-lapse did not restore the old fast sky rate.');
    assert(after.sky.timeLapseEnabled === false && after.sky.orbitalClockRunsInSurface === false && after.sky.orbitSteps === 0, 'T did not return to stable independent sky time.');

    assert(after.surface.proceduralSamplingInRenderLoop === false && after.surface.renderLoopProceduralSamples === 0, 'Terrain/water procedural sampling returned to the render loop.');
    assert(after.surface.viewPriorityEnabled === true && after.surface.bestAvailableRefinement === true, 'v37 view-priority terrain behavior regressed.');
    assert(after.surface.waterEnabled === true && after.surface.waterOpaque === true && after.surface.sphereCurvatureEnabled === true, 'Sphere/water baseline regressed.');

    assert(after.waterStability.geometryWaves === false && after.waterStability.fragmentWaves === true, 'Water geometry is still being displaced into polygonal waves.');
    assert(after.waterStability.worldSpaceWaves === true, 'Water waves are not continuous in world space.');
    assert(after.waterStability.wetDryBridgeTrianglesRemoved === true && after.waterStability.steepInlandWaterRejected === true, 'Steep wet/dry water bridging is not blocked.');
    assert(after.waterStability.frontFacesOnly === true && after.waterStability.waterOpaque === true, 'Water face/depth stability regressed.');
    assert(after.waterStability.meshesProcessed >= 1 && after.waterStability.trianglesRemoved > 0, 'Water stabilizer did not process and trim wet/dry geometry.');

    assert(after.vegetation.vegetationEnabled === true && after.vegetation.gpuInstancing === true, 'GPU vegetation is not enabled.');
    assert(after.vegetation.biomeDriven === true && after.vegetation.hydrologyFiltered === true && after.vegetation.distanceLod === true, 'Vegetation is not environment/LOD driven.');
    assert(after.vegetation.globalDisplayCap === false, 'A global vegetation display cap was introduced.');
    assert(after.vegetation.buildsCompleted >= 1 && after.vegetation.terrainSamples > 100 && after.vegetation.waterSamples > 100, 'Vegetation idle build did not sample real environment data.');
    assert(after.vegetation.renderLoopProceduralSamples === 0, 'Vegetation performs procedural samples in the render loop.');
    assert(after.vegetationStability.preservesOldVegetationDuringRebuild === true, 'Vegetation does not remain visible during chunk rebuild handoff.');
    assert(after.vegetationStability.anchorRegistered === true && after.vegetationStability.instancedFrustumCullingDisabled === true, 'Vegetation anchor/culling stability is not active.');
    assert(after.vegetationStability.cullingDisabledMeshes >= 1, 'Instanced vegetation culling was not corrected.');

    assert(after.weather.fieldReady === true && after.weather.cachedField === true, 'Cached weather field is not ready.');
    assert(after.weather.gridSize === 15 && after.weather.waterSamples >= 225 && after.weather.terrainSamples >= 225, 'Weather field did not cache the expected environment grid.');
    assert(after.weather.bilinearInterpolation === true && after.weather.interpolationCalls > 100, 'Weather particles are not using bilinear field interpolation.');
    assert(after.weather.sphericalLatitudeCorrection === true && after.weather.usesWaterCyclePhysics === true, 'Weather field is not using spherical water-cycle wind physics.');
    assert(after.weather.proceduralSamplingInRenderLoop === false && after.weather.renderLoopProceduralSamples === 0, 'Weather performs procedural sampling in the render loop.');
    assert(after.weather.weatherSimulationRunningInSurface === false && after.weather.presentationOnlyAdvection === true, 'Weather presentation restarted the expensive simulation.');
    assert(after.weather.cloudParticles >= 100 && after.weather.precipitationParticles >= 50 && after.weather.particleFrames > 10, 'Weather particle presentation is not running.');
    assert(after.weather.buildsCompleted >= 2 && after.weather.anchorHandoffs >= 1, 'Weather cache did not rebuild cleanly across terrain chunk handoff.');

    assert(after.oss.screenSpaceErrorEnabled === true && after.oss.screenSpaceErrorTargetPixels <= 2.5, 'Cesium-style screen-space-error policy is not enabled.');
    assert(after.oss.screenSpaceErrorSamples > 10 && Number.isFinite(after.oss.averageScreenSpaceError) && Number.isFinite(after.oss.maxScreenSpaceError), 'Screen-space-error diagnostics did not sample terrain tiles.');
    assert(after.oss.sphericalHorizonCulling === true && after.oss.rearViewCulling === true && after.oss.horizonCullTests > 10, 'Spherical horizon/rear culling is not active.');
    assert(after.oss.terrainSkirts === true && after.oss.skirtsBuilt >= 1 && after.oss.skirtTriangles > 0, 'Terrain edge skirts were not attached.');
    assert(after.oss.terrainGeomorphContinuityStrategy === 'edge-skirts-best-available', 'Unexpected LOD seam continuity strategy.');
    assert(after.oss.altitudeAwareFoliageLod === true && after.oss.foliageLodChanges >= 1, 'Terrain3D-style foliage LOD policy did not react to altitude/SSE.');
    assert(after.oss.atmosphereShell === true && after.oss.atmosphereSunCoupled === true && after.oss.atmosphereFrames > 10, 'WorldWind/OpenSpace-style atmosphere shell is not running.');
    assert(after.oss.inheritedBestAvailableRefinement === true && after.oss.inheritedViewPriority === true, 'deck.gl/Cesium best-available view-priority behavior was not retained.');
    assert(after.oss.inheritedBoundedNearCache >= 3, 'Bounded terrain cache was not retained.');
    assert(after.oss.inheritedCachedBilinearWeather === true, 'Nullschool-style cached bilinear weather was not retained.');
    assert(after.oss.globalDisplayCap === false && after.oss.renderLoopProceduralSamples === 0, 'OSS consolidation introduced a display cap or render-loop sampling.');
    assert(after.oss.visibleTrackedMeshes >= 1, 'OSS culling hid every tracked surface mesh.');

    assert(after.horizon.buildsCompleted >= 1 && after.horizon.mergedSingleMesh === true, 'High-altitude merged horizon ring was not built.');
    assert(after.horizon.ring === 3 && after.horizon.vertices >= 500 && after.horizon.renderLoopProceduralSamples === 0, 'High-altitude horizon contract failed.');

    assert(after.solar.sunDirectionCoupled === true && after.solar.sunBrightnessCoupled === true && after.solar.shadowsEnabled === false, 'Solar-lighting baseline regressed.');
    assert(after.scheduler.policy === 'near-first-interaction-debounced-distant', 'Idle scheduling policy regressed.');
    assert(after.diagnostics.surfaceGpu?.gpuPrimary === true && after.diagnostics.surfaceGpu?.rendererInfo?.triangles > 100, 'GPU surface renderer is not healthy.');
    assert(after.diagnostics.surfaceGpuBackend?.renderer, 'WebGL backend renderer string is missing.');
    assert(moved > 20, `Long WASD movement did not move enough to exercise tile handoff (${moved}).`);
    assert(pageErrors.length === 0, `Surface mode produced browser errors: ${pageErrors.join(' | ')}`);

    await page.evaluate(() => window.realitySandboxSurfaceMode.exit());
    await page.waitForFunction(() => document.documentElement.dataset.surfaceMode === 'inactive', null, { timeout: 10000 });
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
