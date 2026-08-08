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
      window.realitySandboxSurfaceFlatDiagnostic?.installed &&
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
    await page.waitForTimeout(420);

    const before = await page.evaluate(() => ({
      player: window.realitySandboxSurfaceMode.getPlayer(),
      diagnostics: window.realitySandboxPresentationDiagnostics(),
    }));

    await page.keyboard.down('w');
    await page.waitForTimeout(520);
    await page.keyboard.up('w');
    await page.waitForTimeout(260);

    const after = await page.evaluate(() => ({
      player: window.realitySandboxSurfaceMode.getPlayer(),
      diagnostics: window.realitySandboxPresentationDiagnostics(),
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

    await page.screenshot({ path: path.join(artifactDir, 'surface-mode-flat-gpu.png'), fullPage: true });
    fs.writeFileSync(path.join(artifactDir, 'surface-mode.json'), JSON.stringify({ before, after, pageErrors }, null, 2));

    const moved = Math.hypot(after.player.x - before.player.x, after.player.y - before.player.y);
    assert(before.diagnostics.surfaceModeReady === true, 'Surface mode diagnostics never became ready.');
    assert(after.active && after.gpuCanvasVisible, 'Flat GPU surface mode did not remain active with a visible WebGL canvas.');
    assert(after.surfaceBuild === 'surface-v30-flat-gpu-smooth-checkpoint', `Unexpected surface build: ${after.surfaceBuild}`);
    assert(after.diagnostics.surfaceGpu?.gpuPrimary === true, 'Flat WebGL renderer is not primary.');
    assert(after.diagnostics.surfaceGpu?.diagnosticScene === 'single-flat-plane', 'Unexpected diagnostic scene.');
    assert(after.diagnostics.surfaceGpu?.rendererInfo?.calls > 0, 'Flat GPU renderer produced no draw calls.');
    assert(after.diagnostics.surfaceGpu?.rendererInfo?.triangles > 0, 'Flat GPU renderer produced no triangles.');
    assert(after.diagnostics.surfaceCpuRelief?.hiddenRootPresentationSuspended === true, 'Hidden Pixi root presentation was not suspended.');
    assert(after.diagnostics.surfaceCpuRelief?.rootRendersSkipped > 0, 'No hidden root render calls were skipped.');
    assert(after.diagnostics.surfaceFlatDiagnostic?.surfaceActive === true, 'Flat isolation did not activate.');
    assert(after.diagnostics.surfaceFlatDiagnostic?.proceduralSampling === false, 'Procedural sampling is still enabled.');
    assert(after.diagnostics.surfaceFlatDiagnostic?.simulationRunning === false, 'Simulation is still running during flat isolation.');
    assert(after.diagnostics.surfaceFlatDiagnostic?.worldStepsSuppressed > 0, 'World steps were not suppressed.');
    assert(after.diagnostics.surfaceFlatDiagnostic?.moduleStepsSuppressed > 0, 'Module steps were not suppressed.');
    assert(after.diagnostics.surfaceFlatDiagnostic?.terrainSamplesSuppressed > 0, 'Controller terrain samples were not intercepted.');
    assert(after.diagnostics.surfaceFlatDiagnostic?.waterSamplesSuppressed > 0, 'Controller water samples were not intercepted.');
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
