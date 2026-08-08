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
      window.realitySandboxSurfaceSphereV33?.installed &&
      window.realitySandboxSurfaceCelestialsV34?.installed &&
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
      window.realitySandboxSurfaceSphereV33?.getStats?.().nearBuildsCompleted >= 1 &&
      window.realitySandboxSurfaceCelestialsV34?.getStats?.().updates >= 2
    ), null, { timeout: 60000 });

    const nearReady = await page.evaluate(() => ({
      player: window.realitySandboxSurfaceMode.getPlayer(),
      diagnostics: window.realitySandboxPresentationDiagnostics(),
      surface: window.realitySandboxSurfaceSphereV33.getStats(),
      sky: window.realitySandboxSurfaceCelestialsV34.getStats(),
    }));

    await page.waitForFunction(() => (
      window.realitySandboxSurfaceSphereV33?.getStats?.().distantBuildsCompleted >= 1
    ), null, { timeout: 60000 });

    await page.keyboard.down('w');
    await page.waitForTimeout(420);
    await page.keyboard.up('w');
    await page.waitForTimeout(220);

    const after = await page.evaluate(() => ({
      player: window.realitySandboxSurfaceMode.getPlayer(),
      diagnostics: window.realitySandboxPresentationDiagnostics(),
      surface: window.realitySandboxSurfaceSphereV33.getStats(),
      sky: window.realitySandboxSurfaceCelestialsV34.getStats(),
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

    await page.screenshot({ path: path.join(artifactDir, 'surface-mode-v34-orbital-sky.png'), fullPage: true });
    fs.writeFileSync(path.join(artifactDir, 'surface-mode.json'), JSON.stringify({ nearReady, after, pageErrors }, null, 2));

    const moved = Math.hypot(after.player.x - nearReady.player.x, after.player.y - nearReady.player.y);
    assert(nearReady.diagnostics.surfaceModeReady === true, 'Surface mode diagnostics never became ready.');
    assert(after.active && after.gpuCanvasVisible && after.celestialCanvasVisible, 'v34 surface/celestial presentation did not remain active.');
    assert(after.surfaceBuild === 'surface-v34-orbital-sky-spherical-lod', `Unexpected surface build: ${after.surfaceBuild}`);
    assert(after.controller?.topology === 'sphere', 'Surface movement controller is not using spherical topology.');
    assert(after.diagnostics.surfaceGpu?.gpuPrimary === true, 'WebGL renderer is not primary.');
    assert(after.diagnostics.surfaceGpu?.rendererInfo?.triangles > 100, 'Spherical cached surface produced too few triangles.');
    assert(after.diagnostics.surfaceCpuRelief?.hiddenRootPresentationSuspended === true, 'Hidden Pixi root presentation was not suspended.');
    assert(after.diagnostics.surfaceSphereV33?.simulationRunning === false, 'Expensive simulation is running in Surface Mode.');
    assert(after.diagnostics.surfaceSphereV33?.waterEnabled === true, 'Cached GPU water is not enabled.');
    assert(after.diagnostics.surfaceSphereV33?.sphereCurvatureEnabled === true, 'Sphere curvature is not enabled.');
    assert(after.diagnostics.surfaceSphereV33?.proceduralSamplingInRenderLoop === false, 'Procedural sampling is in the render loop.');
    assert(after.surface.renderLoopProceduralSamples === 0, 'Render loop performed procedural terrain/water samples.');
    assert(after.sky.source === 'Nysa orbital model', `Unexpected celestial source: ${after.sky.source}`);
    assert(after.sky.axialTiltCoupled === true && after.sky.observerLatitudeLongitudeCoupled === true, 'Celestial position is not coupled to Nysa geometry.');
    assert(after.sky.moonPhaseFromElongation === true && after.sky.apparentAngularSizeModeled === true, 'Moon phase/angular-size model is not enabled.');
    assert(after.sky.updates >= 2, 'Celestial layer did not update.');
    assert(Number.isFinite(after.sky.sunAltitudeDeg) && Number.isFinite(after.sky.sunAzimuthDeg), 'Sun coordinates are invalid.');
    assert(Number.isFinite(after.sky.moonAltitudeDeg) && Number.isFinite(after.sky.moonAzimuthDeg), 'Moon coordinates are invalid.');
    assert(after.sky.sunAngularDiameterDeg > 0 && after.sky.moonAngularDiameterDeg > 0, 'Celestial angular sizes are invalid.');
    assert(after.sky.moonIllumination >= 0 && after.sky.moonIllumination <= 1, 'Moon illumination is outside 0..1.');
    assert(typeof after.sky.moonPhase === 'string' && after.sky.moonPhase.length > 0, 'Moon phase name is missing.');
    assert(after.surface.distantBuildsCompleted >= 1 && after.surface.distantTilesVisible >= 1, 'Deferred distant spherical squares did not begin streaming.');
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
