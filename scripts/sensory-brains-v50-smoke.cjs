const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_SENSORY_BRAINS_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'sensory-brains-v50-smoke');
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
      window.realitySandboxDebug?.ready &&
      window.realitySandboxOriginMotileLifeV47?.installed &&
      window.realitySandboxClosedNutrientCycleV49?.installed &&
      window.realitySandboxSensoryBrainsV50?.installed &&
      window.realitySandboxSensoryBrainInspectorV50a?.installed
    ), null, { timeout: 120000 });

    await page.evaluate(() => window.realitySandboxDebug.advance(3600));
    await page.waitForFunction(() => window.realitySandboxSensoryBrainsV50?.getStats?.().decisions > 0, null, { timeout: 30000 });

    const state = await page.evaluate(() => {
      const origin = window.realitySandboxOriginMotileLifeV47;
      const brain = window.realitySandboxSensoryBrainsV50;
      const inspector = window.realitySandboxEvolutionInspectorV47b;
      const brainInspector = window.realitySandboxSensoryBrainInspectorV50a;
      const lineages = origin.getLineages();
      const motileLineage = lineages.find(x => x.type === 'motile' && x.population > 0) || lineages.find(x => x.type === 'motile');
      if (motileLineage) inspector.selectLineage(motileLineage.id);
      inspector.open();
      brainInspector.render();
      const host = document.getElementById('evolutionInspectorV47bHost');
      const root = host?.shadowRoot;
      const behaviors = brain.getPopulationBehaviors();
      return {
        evolutionBuild: document.documentElement.dataset.evolutionBuild,
        brainStats: brain.getStats(),
        brainInspectorStats: brainInspector.getStats(),
        behaviorCount: behaviors.length,
        recordsWithModes: behaviors.filter(x => typeof x.mode === 'string' && x.drives).length,
        modes: [...new Set(behaviors.map(x => x.mode).filter(Boolean))],
        selectedLineageId: inspector.getStats().selectedLineageId,
        inspectorText: root?.querySelector('.brain-v50-body')?.textContent || '',
        modeRows: root?.querySelectorAll('.brain-v50-mode')?.length || 0,
        originStats: origin.getStats(),
      };
    });

    assert(state.brainStats.installed === true, 'v50 sensory brains are not installed.');
    assert(state.brainStats.authoritativeFixedStep === true, 'v50 is not on the authoritative fixed step.');
    assert(state.brainStats.spatialHashing === true, 'v50 sensory decisions are not spatially hashed.');
    assert(state.brainStats.heritableBehaviorFromGenome === true, 'v50 behavior is not genome-derived.');
    assert(state.brainStats.noHardPopulationCap === true && state.brainStats.noHardDisplayCap === true, 'v50 introduced a hard cap.');
    assert(state.brainStats.decisions > 0 && state.brainStats.steps > 0, 'v50 made no behavioral decisions.');
    assert(state.behaviorCount >= 1 && state.recordsWithModes >= 1, 'No motile organism received a v50 behavioral phenotype.');
    assert(state.modes.every(mode => state.brainStats.behaviorModes.includes(mode)), `Unexpected v50 mode: ${state.modes.join(', ')}`);
    assert(state.brainInspectorStats.liveBehaviorMix === true, 'v50 inspector behavior mix is inactive.');
    assert(state.modeRows === 7, `Expected 7 behavior rows, found ${state.modeRows}.`);
    assert(state.inspectorText.length > 0, 'v50 inspector section rendered no text.');
    assert(state.originStats.motilePopulation >= 1, 'No motile population survived long enough for v50 testing.');
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'sensory-brains-v50.json'), JSON.stringify({ state, pageErrors }, null, 2));
    await page.screenshot({ path: path.join(artifactDir, 'sensory-brains-v50.png'), fullPage: true });
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
