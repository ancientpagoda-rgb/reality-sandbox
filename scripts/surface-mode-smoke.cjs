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
      window.realitySandboxSurfaceSphereV37?.installed &&
      window.realitySandboxSurfaceCelestialsV35?.installed &&
      window.realitySandboxSurfaceSolarLightingV36?.installed &&
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
      window.realitySandboxSurfaceCelestialsV35?.getStats?.().updates >= 2 &&
      window.realitySandboxSurfaceSolarLightingV36?.getStats?.().updates >= 2
    ), null, { timeout: 60000 });

    const nearReady = await page.evaluate(() => ({
      player: window.realitySandboxSurfaceMode.getPlayer(),
      diagnostics: window.realitySandboxPresentationDiagnostics(),
      surface: window.realitySandboxSurfaceSphereV37.getStats(),
      sky: window.realitySandboxSurfaceCelestialsV35.getStats(),
      solar: window.realitySandboxSurfaceSolarLightingV36.getStats(),
      hook: window.realitySandboxSurfaceLightHookV36.getStats(),
      scheduler: window.realitySandboxSurfaceIdleSchedulerV34.getStats(),
    }));

    await page.waitForFunction(() => {
      const s = window.realitySandboxSurfaceSphereV37?.getStats?.();
      return s?.coarseTilesBuilt >= 1 && s?.refinedTilesBuilt >= 1 && s?.bestAvailableReplacements >= 1;
    }, null, { timeout: 90000 });

    await page.keyboard.down('w');
    await page.waitForTimeout(420);
    await page.keyboard.up('w');
    await page.waitForTimeout(220);

    const after = await page.evaluate(() => ({
      player: window.realitySandboxSurfaceMode.getPlayer(),
      diagnostics: window.realitySandboxPresentationDiagnostics(),
      surface: window.realitySandboxSurfaceSphereV37.getStats(),
      sky: window.realitySandboxSurfaceCelestialsV35.getStats(),
      solar: window.realitySandboxSurfaceSolarLightingV36.getStats(),
      hook: window.realitySandboxSurfaceLightHookV36.getStats(),
      scheduler: window.realitySandboxSurfaceIdleSchedulerV34.getStats(),
      controller: window.realitySandboxSurfaceMode.getStats?.(),
      active: window.realitySandboxSurfaceMode.isActive(),
      gpuCanvasVisible: (() => {
        const canvas = document.getElementById('surfaceGpuCanvas');
        if (!canvas) return false;
        const style = getComputedStyle(canvas);
        const rect = canvas.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      })(),
      celestialCanvasVisible: (() => {
        const canvas = document.getElementById('surfaceCelestialCanvas');
        if (!canvas) return false;
        const style = getComputedStyle(canvas);
        const rect = canvas.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      })(),
      surfaceBuild: window.realitySandboxSurfaceBuild,
    }));

    await page.screenshot({ path: path.join(artifactDir, 'surface-mode-v37-view-priority.png'), fullPage: true });
    fs.writeFileSync(path.join(artifactDir, 'surface-mode.json'), JSON.stringify({ nearReady, after, pageErrors }, null, 2));

    const moved = Math.hypot(after.player.x - nearReady.player.x, after.player.y - nearReady.player.y);
    assert(nearReady.diagnostics.surfaceModeReady === true, 'Surface mode diagnostics never became ready.');
    assert(after.active && after.gpuCanvasVisible && after.celestialCanvasVisible, 'v37 surface/celestial presentation did not remain active.');
    assert(after.surfaceBuild === 'surface-v37-view-priority-best-available', `Unexpected surface build: ${after.surfaceBuild}`);
    assert(after.controller?.topology === 'sphere', 'Surface movement controller is not using spherical topology.');
    assert(after.diagnostics.surfaceGpu?.gpuPrimary === true, 'WebGL renderer is not primary.');
    assert(after.diagnostics.surfaceGpu?.diagnosticScene === 'view-priority-best-available-spherical-terrain-water', 'Unexpected v37 GPU scene.');
    assert(after.diagnostics.surfaceGpu?.rendererInfo?.triangles > 100, 'Spherical cached surface produced too few triangles.');
    assert(after.diagnostics.surfaceCpuRelief?.hiddenRootPresentationSuspended === true, 'Hidden Pixi root presentation was not suspended.');
    assert(after.diagnostics.surfaceSphereV37?.simulationRunning === false, 'Expensive simulation is running in Surface Mode.');
    assert(after.diagnostics.surfaceSphereV37?.waterEnabled === true && after.diagnostics.surfaceSphereV37?.waterOpaque === true, 'Water is not opaque/enabled.');
    assert(after.diagnostics.surfaceSphereV37?.sphereCurvatureEnabled === true, 'Sphere curvature is not enabled.');
    assert(after.diagnostics.surfaceSphereV37?.proceduralSamplingInRenderLoop === false, 'Procedural sampling is in the render loop.');
    assert(after.surface.renderLoopProceduralSamples === 0, 'Render loop performed procedural terrain/water samples.');
    assert(after.surface.viewPriorityEnabled === true, 'View-priority tile selection is not enabled.');
    assert(after.surface.bestAvailableRefinement === true, 'Best-available refinement is not enabled.');
    assert(after.surface.rearTileDeferral === true, 'Behind-camera tile deferral is not enabled.');
    assert(after.surface.priorityQueueResorts >= 2, 'Distant tile queue was not re-prioritized against the current view.');
    assert(after.surface.coarseTilesBuilt >= 1, 'No coarse best-available distant tile was built.');
    assert(after.surface.refinedTilesBuilt >= 1 && after.surface.bestAvailableReplacements >= 1, 'Coarse-to-refined atomic replacement did not occur.');
    assert(after.surface.nearCacheLimit === 3 && after.surface.nearCacheMisses >= 1, 'Bounded near-chunk cache is not active.');
    assert(after.scheduler.policy === 'near-first-interaction-debounced-distant', `Unexpected scheduler policy: ${after.scheduler.policy}`);
    assert(after.sky.surfaceRotationClockIndependent === true, 'Sky rotation is still tied to the fast orbital clock.');
    assert(after.sky.orbitalClockRunsInSurface === false && after.sky.orbitSteps === 0, 'Celestial layer is stepping the global orbit during Surface Mode.');
    assert(after.sky.cameraProjectedStars === true && after.sky.cameraProjectedSunMoon === true, 'Sky objects are not camera-projected.');
    assert(after.hook.sceneCaptured && after.hook.sunCaptured && after.hook.hemisphereCaptured, 'Existing Three.js surface lights were not captured.');
    assert(after.hook.rendererCaptured && after.hook.cameraCaptured, 'Surface renderer/camera were not captured after entry.');
    assert(after.solar.rendererAttached && after.solar.cameraAttached, 'Solar lighting controller is not attached to the active surface renderer.');
    assert(after.solar.sunDirectionCoupled === true && after.solar.sunBrightnessCoupled === true, 'Directional Sun coupling is not enabled.');
    assert(after.solar.hemisphereCoupled === true && after.solar.fogAndSkyCoupled === true && after.solar.exposureCoupled === true, 'Ambient/sky/exposure coupling is incomplete.');
    assert(after.solar.usesExistingThreeLights === true, 'v37 replaced the proven lighting path instead of coupling it.');
    assert(after.solar.shadowsEnabled === false && after.solar.performancePolicy === 'lighting-only-no-shadow-map', 'Shadow maps were enabled during the zero-lag v37 phase.');
    assert(Number.isFinite(after.solar.sunIntensity) && after.solar.sunIntensity >= 0, 'Sun light intensity is invalid.');
    assert(Number.isFinite(after.solar.hemisphereIntensity) && after.solar.hemisphereIntensity >= 0, 'Hemisphere intensity is invalid.');
    assert(Number.isFinite(after.solar.exposure) && after.solar.exposure > 0, 'Tone-mapping exposure is invalid.');
    assert(after.surface.distantBuildsCompleted >= 2 && after.surface.distantTilesVisible >= 1, 'View-priority distant streaming did not begin.');
    assert(after.diagnostics.surfaceGpuBackend?.renderer, 'WebGL backend renderer string is missing.');
    assert(moved > 0.5, `WASD movement did not move the player enough (${moved}).`);
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