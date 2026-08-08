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
      window.realitySandboxSurfaceGpuBackend?.installed &&
      document.getElementById('enterSurfaceMode') &&
      document.getElementById('surfaceGpuCanvas')
    ), null, { timeout: 120000 });

    await page.click('#enterSurfaceMode');
    await page.waitForFunction(() => (
      document.documentElement.dataset.surfaceMode === 'active' &&
      document.documentElement.dataset.surfaceGpu === 'active' &&
      window.realitySandboxSurfaceGpu?.isPresenting?.()
    ), null, { timeout: 30000 });

    await page.waitForFunction(() => (
      window.realitySandboxSurfaceSphereV33?.getStats?.().nearBuildsCompleted >= 1
    ), null, { timeout: 60000 });

    const nearReady = await page.evaluate(() => ({
      player: window.realitySandboxSurfaceMode.getPlayer(),
      diagnostics: window.realitySandboxPresentationDiagnostics(),
      surface: window.realitySandboxSurfaceSphereV33.getStats(),
    }));

    await page.waitForFunction(() => (
      window.realitySandboxSurfaceSphereV33?.getStats?.().distantBuildsCompleted >= 1
    ), null, { timeout: 60000 });

    await page.keyboard.down('w');
    await page.waitForTimeout(420);
    await page.keyboard.up('w');
    await page.waitForTimeout(180);

    const after = await page.evaluate(() => ({
      player: window.realitySandboxSurfaceMode.getPlayer(),
      diagnostics: window.realitySandboxPresentationDiagnostics(),
      surface: window.realitySandboxSurfaceSphereV33.getStats(),
      controller: window.realitySandboxSurfaceMode.getStats?.(),
      active: window.realitySandboxSurfaceMode.isActive(),
      gpuCanvasVisible: (() => {
        const canvas = document.getElementById('surfaceGpuCanvas');
        if (!canvas) return false;
        const style = getComputedStyle(canvas);
        const rect = canvas.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      })(),
      surfaceBuild: window.realitySandboxSurfaceBuild,
    }));

    await page.screenshot({ path: path.join(artifactDir, 'surface-mode-v33-sphere.png'), fullPage: true });
    fs.writeFileSync(path.join(artifactDir, 'surface-mode.json'), JSON.stringify({ nearReady, after, pageErrors }, null, 2));

    const moved = Math.hypot(after.player.x - nearReady.player.x, after.player.y - nearReady.player.y);
    assert(nearReady.diagnostics.surfaceModeReady === true, 'Surface mode diagnostics never became ready.');
    assert(after.active && after.gpuCanvasVisible, 'Spherical cached GPU surface did not remain active.');
    assert(after.surfaceBuild === 'surface-v33-spherical-water-lod-rings', `Unexpected surface build: ${after.surfaceBuild}`);
    assert(after.controller?.topology === 'sphere', 'Surface movement controller is not using spherical topology.');
    assert(after.diagnostics.surfaceModeRenderer === 'gpu-controller-spherical-topology', `Unexpected controller: ${after.diagnostics.surfaceModeRenderer}`);
    assert(after.diagnostics.surfaceGpu?.gpuPrimary === true, 'WebGL renderer is not primary.');
    assert(after.diagnostics.surfaceGpu?.diagnosticScene === 'cached-spherical-terrain-water-lod-rings', 'Unexpected v33 scene.');
    assert(after.diagnostics.surfaceGpu?.rendererInfo?.calls > 0, 'GPU renderer produced no draw calls.');
    assert(after.diagnostics.surfaceGpu?.rendererInfo?.triangles > 100, 'Spherical cached surface produced too few triangles.');
    assert(after.diagnostics.surfaceCpuRelief?.hiddenRootPresentationSuspended === true, 'Hidden Pixi root presentation was not suspended.');
    assert(after.diagnostics.surfaceSphereV33?.simulationRunning === false, 'Simulation is running during v33 presentation phase.');
    assert(after.diagnostics.surfaceSphereV33?.waterEnabled === true, 'Cached GPU water is not enabled.');
    assert(after.diagnostics.surfaceSphereV33?.sphereCurvatureEnabled === true, 'Sphere curvature is not enabled.');
    assert(after.diagnostics.surfaceSphereV33?.sphericalPoleSampling === true, 'Pole-reflected terrain sampling is not enabled.');
    assert(after.diagnostics.surfaceSphereV33?.vegetationEnabled === false, 'Vegetation was reintroduced too early.');
    assert(after.diagnostics.surfaceSphereV33?.weatherEnabled === false, 'Weather was reintroduced too early.');
    assert(after.diagnostics.surfaceSphereV33?.creaturesEnabled === false, 'Creatures were reintroduced too early.');
    assert(after.diagnostics.surfaceSphereV33?.proceduralSamplingInRenderLoop === false, 'Procedural sampling is in the render loop.');
    assert(after.surface.renderLoopProceduralSamples === 0, 'Render loop performed procedural samples.');
    assert(nearReady.surface.terrainSamples > 1000, 'Real procedural terrain was not sampled for the near tile.');
    assert(nearReady.surface.waterSamples > 1000, 'Hydrology was not sampled for cached GPU water.');
    assert(after.surface.distantBuildsCompleted >= 1 && after.surface.distantTilesVisible >= 1, 'Deferred distant spherical squares did not begin streaming.');
    assert(after.surface.plannedDistantTiles === 24, `Unexpected distant tile plan: ${after.surface.plannedDistantTiles}`);
    assert(after.surface.curvatureRadius > 0, 'Curvature radius is invalid.');
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
