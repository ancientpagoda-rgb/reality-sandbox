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
      window.realitySandboxSurfaceVegetationV38?.installed &&
      window.realitySandboxSurfaceWeatherV39?.installed &&
      window.realitySandboxSurfaceRiversV41?.installed
    ), null, { timeout: 120000 });

    // Preserve the regression for the old fauna startup timeout.
    await page.waitForTimeout(18000);

    await page.click('#enterSurfaceMode');
    await page.waitForFunction(() => document.documentElement.dataset.surfaceMode === 'active' && window.realitySandboxSurfaceGpu?.isPresenting?.(), null, { timeout: 30000 });

    await page.waitForFunction(() => Boolean(
      window.realitySandboxSurfaceCreaturesV44?.installed &&
      window.realitySandboxEvolutionaryEcologyV45?.installed &&
      window.realitySandboxEcologicalMigrationV46?.installed &&
      window.realitySandboxSurfaceWidePitchV46d?.installed &&
      window.realitySandboxSurfaceRenderBridgeV46d?.installed &&
      window.realitySandboxSurfaceFaunaExactV46d?.installed
    ), null, { timeout: 60000 });

    await page.waitForFunction(() => {
      const fauna = window.realitySandboxSurfaceFaunaExactV46d?.getStats?.();
      const bridge = window.realitySandboxSurfaceRenderBridgeV46d?.getStats?.();
      const evolution = window.realitySandboxEvolutionaryEcologyV45?.getStats?.();
      const migration = window.realitySandboxEcologicalMigrationV46?.getStats?.();
      return fauna?.updates >= 2 &&
        fauna?.actualCanvasId === 'surfaceGpuCanvas' &&
        fauna?.renderedAgents >= 4 &&
        fauna?.screenVisibleAgents >= 4 &&
        fauna?.centralVisibleAgents >= 3 &&
        fauna?.readablePixelAgents >= 3 &&
        fauna?.maxProjectedPixelHeight >= 16 &&
        bridge?.cameraCaptured === true &&
        bridge?.sceneCaptured === true &&
        evolution?.ticks >= 2 &&
        migration?.ticks >= 1;
    }, null, { timeout: 60000 });

    // Exact user regression: maximum altitude must still allow a near-nadir view.
    await page.evaluate(() => {
      window.dispatchEvent(new WheelEvent('wheel', { deltaY: -20000, bubbles: true, cancelable: true }));
      window.realitySandboxSurfaceWidePitchV46d.setPitch(-1.48);
    });
    await page.waitForTimeout(220);
    const highView = await page.evaluate(() => ({
      player: window.realitySandboxSurfaceMode.getPlayer(),
      pitch: window.realitySandboxSurfaceWidePitchV46d.getStats(),
      flight: window.realitySandboxSurfaceFlightV38.getStats(),
    }));
    assert(highView.player.altitude >= 4000, `High-flight regression: altitude only ${highView.player.altitude}.`);
    assert(highView.player.pitch <= -1.45, `Downward-view regression: pitch only ${highView.player.pitch}.`);
    assert(highView.pitch.maxPitchDegrees >= 85, `Pitch envelope too narrow (${highView.pitch.maxPitchDegrees}).`);

    // Return to ground/level before movement and visual checks.
    await page.evaluate(() => {
      window.realitySandboxSurfaceWidePitchV46d.setPitch(0);
      window.dispatchEvent(new WheelEvent('wheel', { deltaY: 20000, bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(220);

    const beforePlayer = await page.evaluate(() => window.realitySandboxSurfaceMode.getPlayer());
    await page.keyboard.down('w');
    await page.waitForTimeout(850);
    await page.keyboard.up('w');
    await page.waitForTimeout(350);

    const after = await page.evaluate(() => ({
      player: window.realitySandboxSurfaceMode.getPlayer(),
      build: window.realitySandboxSurfaceBuild,
      surface: window.realitySandboxSurfaceSphereV37.getStats(),
      creatures: window.realitySandboxSurfaceCreaturesV44.getStats(),
      widePitch: window.realitySandboxSurfaceWidePitchV46d.getStats(),
      bridge: window.realitySandboxSurfaceRenderBridgeV46d.getStats(),
      faunaExact: window.realitySandboxSurfaceFaunaExactV46d.getStats(),
      evolution: window.realitySandboxEvolutionaryEcologyV45.getStats(),
      migration: window.realitySandboxEcologicalMigrationV46.getStats(),
      weather: window.realitySandboxSurfaceWeatherV39.getStats(),
      vegetation: window.realitySandboxSurfaceVegetationV38.getStats(),
      rivers: window.realitySandboxSurfaceRiversV41.getStats(),
    }));

    const moved = Math.hypot(after.player.x - beforePlayer.x, after.player.y - beforePlayer.y);
    assert(after.build === 'surface-v46d-exact-fauna-nadir-view', `Unexpected build ${after.build}`);
    assert(moved > 2, `Surface movement smoke check failed (${moved}).`);
    assert(after.surface.curvatureRadius >= 26000 && after.surface.renderLoopProceduralSamples === 0, 'Large-planet terrain baseline regressed.');

    assert(after.widePitch.nearVerticalDownView === true && after.widePitch.maxPitchDegrees >= 85, 'Near-vertical camera pitch is inactive.');
    assert(after.bridge.exactSurfaceCanvasCapture === true && after.bridge.canvasId === 'surfaceGpuCanvas', 'Exact Surface GPU renderer bridge is inactive.');

    assert(after.faunaExact.exactSurfaceRendererBinding === true && after.faunaExact.actualCanvasId === 'surfaceGpuCanvas', 'Fauna is not bound to the exact Surface renderer.');
    assert(after.faunaExact.bodyHeadLegMorphology === true && after.faunaExact.renderedAgents >= 4, 'Readable fauna morphology did not render.');
    assert(after.faunaExact.screenVisibleAgents >= 4 && after.faunaExact.centralVisibleAgents >= 3, 'Fauna is not actually in the camera viewport.');
    assert(after.faunaExact.readablePixelAgents >= 3 && after.faunaExact.maxProjectedPixelHeight >= 16, `Fauna is too small on screen (${after.faunaExact.maxProjectedPixelHeight}px).`);
    assert(after.faunaExact.overheadLifeMarkers === true && after.faunaExact.lifeMarkersUseActualEcsPositions === true, 'Real-position fauna locator layer is inactive.');
    assert(after.faunaExact.exactRenderedTerrainGrounding === true && after.faunaExact.globalPopulationCap === false && after.faunaExact.globalDisplayCap === false, 'Fauna grounding/cap policy regressed.');
    assert(after.faunaExact.proceduralSamplingInRenderLoop === false && after.faunaExact.renderLoopProceduralSamples === 0, 'Exact fauna renderer performs procedural render-loop sampling.');

    assert(after.creatures.spatialHash === true && after.creatures.quadraticNeighborScans === false, 'Creature spatial hash regressed.');
    assert(after.evolution.habitatDrivenPopulations === true && after.evolution.randomSpeciation === false, 'v45 habitat selection/speciation regressed.');
    assert(after.migration.migrationEnabled === true && after.migration.speciesLevelMigration === true, 'v46 migration regressed.');
    assert(after.weather.renderLoopProceduralSamples === 0, 'Weather render-loop sampling regressed.');
    assert(after.vegetation.renderLoopProceduralSamples === 0, 'Vegetation render-loop sampling regressed.');
    assert(after.rivers.renderLoopProceduralSamples === 0, 'River render-loop sampling regressed.');
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    await page.screenshot({ path: path.join(artifactDir, 'surface-mode-v46d-exact-fauna-nadir-view.png'), fullPage: true });
    fs.writeFileSync(path.join(artifactDir, 'surface-mode.json'), JSON.stringify({ beforePlayer, highView, after, moved, pageErrors }, null, 2));
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