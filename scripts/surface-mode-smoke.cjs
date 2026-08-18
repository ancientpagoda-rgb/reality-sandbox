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
      window.realitySandboxSurfaceGlobeV73?.installed &&
      window.realitySandboxSurfaceFlightV38?.installed &&
      window.realitySandboxSurfaceWidePitchV46d?.installed &&
      window.realitySandboxUnified?.getCamera
    ), null, { timeout: 120000 });

    const cameraBefore = await page.evaluate(() => window.realitySandboxUnified.getCamera());
    await page.click('#enterSurfaceMode');
    await page.waitForFunction(() => document.documentElement.dataset.surfaceMode === 'active', null, { timeout: 30000 });
    await page.waitForFunction(() => (
      document.documentElement.dataset.surfacePresentation === 'globe' &&
      document.documentElement.dataset.surfaceCameraTransition === 'none'
    ), null, { timeout: 10000 });

    const entered = await page.evaluate(() => {
      const visible = element => {
        if (!element || element.hidden) return false;
        let node = element;
        while (node && node instanceof Element) {
          if (node.hidden) return false;
          const style = getComputedStyle(node);
          if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) <= 0) return false;
          node = node.parentElement;
        }
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      return {
        player: window.realitySandboxSurfaceMode.getPlayer(),
        camera: window.realitySandboxUnified.getCamera(),
        globe: window.realitySandboxSurfaceGlobeV73.getStats(),
        rootVisible: visible(document.getElementById('lofiLivingCanvas')),
        tangentVisible: visible(document.getElementById('surfaceGpuCanvas')),
        renderer: document.documentElement.dataset.surfaceModeRenderer,
        geometry: document.body.dataset.worldGeometry,
        presentation: document.documentElement.dataset.surfacePresentation,
      };
    });

    assert(entered.globe.geometry === 'globe', `Surface geometry is ${entered.globe.geometry}.`);
    assert(entered.globe.canonicalRenderer === 'lofiLivingCanvas', `Unexpected canonical renderer ${entered.globe.canonicalRenderer}.`);
    assert(entered.globe.continuousCameraTransition === true, 'Continuous globe camera transition is not enabled.');
    assert(entered.rootVisible, 'The canonical Pixi globe disappeared in Surface mode.');
    assert(!entered.tangentVisible, 'The legacy local tangent renderer is still visibly replacing the globe.');
    assert(entered.renderer === 'pixi-globe-surface', `Unexpected Surface renderer ${entered.renderer}.`);
    assert(entered.geometry === 'sphere' && entered.presentation === 'globe', 'Surface mode is not presenting a sphere/globe.');

    const beforePlayer = entered.player;
    await page.keyboard.down('w');
    await page.waitForTimeout(850);
    await page.keyboard.up('w');
    await page.waitForTimeout(350);

    const moved = await page.evaluate(() => ({
      player: window.realitySandboxSurfaceMode.getPlayer(),
      camera: window.realitySandboxUnified.getCamera(),
      world: {
        width: window.realitySandboxPlanet.world.width,
        height: window.realitySandboxPlanet.world.height,
      },
    }));
    const movement = Math.hypot(moved.player.x - beforePlayer.x, moved.player.y - beforePlayer.y);
    assert(movement > 2, `Surface movement smoke check failed (${movement}).`);
    const expectedCenterX = ((moved.player.x / moved.world.width) % 1 + 1) % 1;
    const expectedCenterY = Math.max(0.01, Math.min(0.99, moved.player.y / moved.world.height));
    const wrappedCenterError = Math.abs((((moved.camera.centerX - expectedCenterX) + 0.5) % 1 + 1) % 1 - 0.5);
    assert(wrappedCenterError < 0.04 && Math.abs(moved.camera.centerY - expectedCenterY) < 0.04, 'The globe camera is not following Surface latitude/longitude.');

    const groundZoom = moved.camera.zoom;
    await page.evaluate(() => {
      window.dispatchEvent(new WheelEvent('wheel', { deltaY: -20000, bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(650);
    const highView = await page.evaluate(() => ({
      player: window.realitySandboxSurfaceMode.getPlayer(),
      camera: window.realitySandboxUnified.getCamera(),
      globe: window.realitySandboxSurfaceGlobeV73.getStats(),
      flight: window.realitySandboxSurfaceFlightV38.getStats(),
    }));
    assert(highView.player.altitude >= 4000, `High-flight regression: altitude only ${highView.player.altitude}.`);
    assert(highView.camera.zoom < groundZoom - 0.12, `Altitude did not pull the globe outward (${groundZoom} -> ${highView.camera.zoom}).`);
    assert(highView.globe.localTangentRendererVisible === false, 'High-altitude Surface mode reverted to a tangent plane.');

    await page.screenshot({ path: path.join(artifactDir, 'surface-globe-v73b.png'), fullPage: true });

    await page.evaluate(() => window.realitySandboxSurfaceMode.exit());
    await page.waitForFunction(() => document.documentElement.dataset.surfaceMode === 'inactive', null, { timeout: 10000 });
    await page.waitForFunction(() => (
      document.documentElement.dataset.surfaceCameraTransition === 'none' &&
      document.documentElement.dataset.surfacePresentation === 'globe-ready'
    ), null, { timeout: 10000 });

    const cameraAfter = await page.evaluate(() => window.realitySandboxUnified.getCamera());
    const restoredX = Math.abs((((cameraAfter.centerX - cameraBefore.centerX) + 0.5) % 1 + 1) % 1 - 0.5);
    assert(restoredX < 0.002, `Exit did not restore longitude camera (${cameraBefore.centerX} -> ${cameraAfter.centerX}).`);
    assert(Math.abs(cameraAfter.centerY - cameraBefore.centerY) < 0.002, 'Exit did not restore latitude camera.');
    assert(Math.abs(cameraAfter.zoom - cameraBefore.zoom) < 0.002, 'Exit did not restore globe scale.');
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'surface-globe.json'), JSON.stringify({
      cameraBefore,
      entered,
      beforePlayer,
      moved,
      movement,
      highView,
      cameraAfter,
      pageErrors,
    }, null, 2));
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
