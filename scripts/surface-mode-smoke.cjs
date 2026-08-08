const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

// Diagnostic PR retrigger after README audit repair; assertions match main v26.
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
    await page.waitForTimeout(320);

    const before = await page.evaluate(() => ({
      player: window.realitySandboxSurfaceMode.getPlayer(),
      diagnostics: window.realitySandboxPresentationDiagnostics(),
    }));

    await page.keyboard.down('w');
    await page.waitForTimeout(420);
    await page.keyboard.up('w');
    await page.waitForTimeout(180);

    const after = await page.evaluate(() => ({
      player: window.realitySandboxSurfaceMode.getPlayer(),
      diagnostics: window.realitySandboxPresentationDiagnostics(),
      active: window.realitySandboxSurfaceMode.isActive(),
      inputCanvasPresent: Boolean(document.getElementById('surfaceModeCanvas')),
      gpuCanvasVisible: (() => {
        const canvas = document.getElementById('surfaceGpuCanvas');
        if (!canvas) return false;
        const style = getComputedStyle(canvas);
        const rect = canvas.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      })(),
      surfaceBuild: window.realitySandboxSurfaceBuild,
    }));

    await page.screenshot({ path: path.join(artifactDir, 'surface-mode-gpu.png'), fullPage: true });
    fs.writeFileSync(path.join(artifactDir, 'surface-mode.json'), JSON.stringify({ before, after, pageErrors }, null, 2));

    const moved = Math.hypot(after.player.x - before.player.x, after.player.y - before.player.y);
    assert(before.diagnostics.surfaceModeReady === true, 'Surface mode diagnostics never became ready.');
    assert(after.active && after.inputCanvasPresent && after.gpuCanvasVisible, 'GPU surface mode did not remain active with a visible WebGL canvas.');
    assert(after.surfaceBuild === 'surface-v26-gpu-cpu-relief', `Unexpected surface build: ${after.surfaceBuild}`);
    assert(after.diagnostics.surfaceMode === 'active', 'Surface mode diagnostics do not report an active presentation.');
    assert(after.diagnostics.surfaceModeRenderer === 'gpu-controller-no-cpu-raycaster', `CPU raycaster still appears active: ${after.diagnostics.surfaceModeRenderer}`);
    assert(after.diagnostics.surfaceGpu?.gpuPrimary === true, 'GPU surface diagnostics do not report the WebGL renderer as primary.');
    assert(after.diagnostics.surfaceGpu?.active === true, 'GPU surface diagnostics do not report active rendering.');
    assert(after.diagnostics.surfaceGpu?.renderer === 'WebGLRenderer', `Unexpected GPU renderer: ${after.diagnostics.surfaceGpu?.renderer}`);
    assert(after.diagnostics.surfaceGpu?.rendererInfo?.calls > 0, 'GPU renderer produced no draw calls.');
    assert(after.diagnostics.surfaceGpu?.rendererInfo?.triangles > 0, 'GPU renderer produced no triangles.');
    assert(after.diagnostics.surfaceCpuRelief?.hiddenRootPresentationSuspended === true, 'Hidden Pixi root presentation was not suspended in surface mode.');
    assert(after.diagnostics.surfaceCpuRelief?.rootRendersSkipped > 0, 'No hidden root render calls were skipped during surface mode.');
    assert(after.diagnostics.surfaceGpuBackend?.renderer, 'WebGL backend diagnostics did not expose a renderer string.');
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
