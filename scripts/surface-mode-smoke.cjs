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
      window.realitySandboxSurfaceRiversV41?.installed &&
      window.realitySandboxSurfaceWidePitchV46d?.installed &&
      window.realitySandboxEvolutionaryEcologyV45?.installed &&
      window.realitySandboxEcologicalMigrationV46?.installed &&
      window.realitySandboxOriginMotileLifeV47?.installed &&
      window.realitySandboxEvolutionInspectorV47b?.installed &&
      window.realitySandboxEvolutionMorphologyV47c?.installed &&
      window.realitySandboxEvolutionaryMilestonesV47d?.installed &&
      window.realitySandboxLineagePopulationRecordV47e?.installed &&
      window.realitySandboxEvolutionDeepTimeV47f?.installed
    ), null, { timeout: 120000 });

    await page.click('#enterSurfaceMode');
    await page.waitForFunction(() => document.documentElement.dataset.surfaceMode === 'active' && window.realitySandboxSurfaceGpu?.isPresenting?.(), null, { timeout: 30000 });
    await page.waitForFunction(() => window.realitySandboxSurfaceSphereV37?.getStats?.().nearBuildsCompleted > 0, null, { timeout: 60000 });

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
      faunaPolicy: document.documentElement.dataset.surfaceFaunaPolicy,
      surface: window.realitySandboxSurfaceSphereV37.getStats(),
      widePitch: window.realitySandboxSurfaceWidePitchV46d.getStats(),
      evolution: window.realitySandboxEvolutionaryEcologyV45.getStats(),
      migration: window.realitySandboxEcologicalMigrationV46.getStats(),
      origin: window.realitySandboxOriginMotileLifeV47.getStats(),
      inspector: window.realitySandboxEvolutionInspectorV47b.getStats(),
      morphology: window.realitySandboxEvolutionMorphologyV47c.getStats(),
      milestones: window.realitySandboxEvolutionaryMilestonesV47d.getStats(),
      record: window.realitySandboxLineagePopulationRecordV47e.getStats(),
      deepTime: window.realitySandboxEvolutionDeepTimeV47f.getStats(),
      weather: window.realitySandboxSurfaceWeatherV39.getStats(),
      vegetation: window.realitySandboxSurfaceVegetationV38.getStats(),
      rivers: window.realitySandboxSurfaceRiversV41.getStats(),
      faunaModulesAbsent: {
        surfaceCreaturesV44: !window.realitySandboxSurfaceCreaturesV44,
        localFaunaV44d: !window.realitySandboxSurfaceLocalFaunaV44d,
        creatureVisibilityV44b: !window.realitySandboxSurfaceCreatureVisibilityV44b,
        creatureReadabilityV44c: !window.realitySandboxSurfaceCreatureReadabilityV44c,
        faunaGuaranteeV45b: !window.realitySandboxSurfaceFaunaGuaranteeV45b,
        faunaExactV46d: !window.realitySandboxSurfaceFaunaExactV46d,
        renderBridgeV46d: !window.realitySandboxSurfaceRenderBridgeV46d,
      },
    }));

    const moved = Math.hypot(after.player.x - beforePlayer.x, after.player.y - beforePlayer.y);
    assert(after.build === 'surface-v47f-deep-time-evolution', `Unexpected build ${after.build}`);
    assert(after.faunaPolicy === 'motile-life-evolves-no-surface-renderer-yet', `Unexpected fauna policy ${after.faunaPolicy}`);
    assert(after.origin.plantFirstOrigin === true && after.origin.legacyFaunaRendererEnabled === false, 'v47 origin-life policy is inactive.');
    assert(after.inspector.collapsedByDefault === true && after.inspector.shadowDomIsolated === true, 'v47b inspector policy regressed.');
    assert(after.morphology.genomeDrivenMorphology === true && after.morphology.ancestryTree === true && after.morphology.surfaceRendererTouched === false, 'v47c morphology/tree policy regressed.');
    assert(after.milestones.authoritativeFixedStep === true && after.milestones.causalContextRecorded === true, 'v47d milestone recorder is not on the authoritative clock.');
    assert(after.record.authoritativeFixedStep === true && after.record.populationHistory === true && after.record.extinctionTracking === true && after.record.geographicRange === true, 'v47e population record contract regressed.');
    assert(after.deepTime.reducedOrderEvolutionaryTime === true && after.deepTime.yearsPerBiologyStep === 25000, 'v47f deep-time scale regressed.');
    assert(Object.values(after.faunaModulesAbsent).every(Boolean), `Experimental Surface fauna module still loaded: ${JSON.stringify(after.faunaModulesAbsent)}`);
    assert(moved > 2, `Surface movement smoke check failed (${moved}).`);
    assert(after.surface.curvatureRadius >= 26000 && after.surface.renderLoopProceduralSamples === 0, 'Large-planet terrain baseline regressed.');
    assert(after.widePitch.nearVerticalDownView === true && after.widePitch.maxPitchDegrees >= 85, 'Near-vertical camera pitch is inactive.');
    assert(after.evolution.habitatDrivenPopulations === true && after.evolution.randomSpeciation === false, 'v45 habitat selection/speciation regressed.');
    assert(after.migration.migrationEnabled === true && after.migration.speciesLevelMigration === true, 'v46 migration regressed.');
    assert(after.weather.renderLoopProceduralSamples === 0, 'Weather render-loop sampling regressed.');
    assert(after.vegetation.renderLoopProceduralSamples === 0, 'Vegetation render-loop sampling regressed.');
    assert(after.rivers.renderLoopProceduralSamples === 0, 'River render-loop sampling regressed.');
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    await page.screenshot({ path: path.join(artifactDir, 'surface-mode-v47f-deep-time-evolution.png'), fullPage: true });
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
