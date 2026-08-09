const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_EVOLUTION_INSPECTOR_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'evolution-inspector-smoke');
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
      window.realitySandboxEvolutionInspectorV47b?.installed
    ), null, { timeout: 120000 });

    const collapsed = await page.evaluate(() => window.realitySandboxEvolutionInspectorV47b.getStats());
    assert(collapsed.collapsedByDefault === true && collapsed.open === false, 'Evolution inspector did not start collapsed.');
    assert(collapsed.shadowDomIsolated === true, 'Evolution inspector is not Shadow-DOM isolated.');

    await page.evaluate(() => window.realitySandboxDebug.advance(3000));
    await page.evaluate(() => window.realitySandboxEvolutionInspectorV47b.open());
    await page.waitForFunction(() => window.realitySandboxEvolutionInspectorV47b?.getStats?.().renderCount >= 1, null, { timeout: 30000 });

    const inspected = await page.evaluate(() => {
      const host = document.getElementById('evolutionInspectorV47bHost');
      const root = host?.shadowRoot;
      const api = window.realitySandboxOriginMotileLifeV47;
      const inspector = window.realitySandboxEvolutionInspectorV47b;
      const lineages = api.getLineages();
      const motile = lineages.find(x => x.type === 'motile');
      if (motile) inspector.selectLineage(motile.id);
      const options = root ? [...root.querySelectorAll('.lineage-select option')].map(x => x.textContent) : [];
      return {
        build: window.realitySandboxSurfaceBuild,
        inspector: inspector.getStats(),
        options,
        selected: root?.querySelector('.lineage-select')?.value || null,
        speciesTitle: root?.querySelector('.species h2')?.textContent || '',
        ancestry: root?.querySelector('.ancestry')?.textContent || '',
        traitRows: root?.querySelectorAll('.trait')?.length || 0,
        behaviorCells: root?.querySelectorAll('.behavior > div')?.length || 0,
        summaryCells: root?.querySelectorAll('.summary .metric')?.length || 0,
        panelOpen: root?.querySelector('.panel')?.classList.contains('open') || false,
        lineages,
        ancestryEvents: api.getAncestry(),
        originStats: api.getStats(),
      };
    });

    assert(inspected.build === 'surface-v47b-evolution-inspector', `Unexpected build ${inspected.build}`);
    assert(inspected.panelOpen === true && inspected.inspector.open === true, 'Evolution inspector did not open.');
    assert(inspected.options.length >= 1, 'Evolution inspector lineage selector is empty.');
    assert(inspected.speciesTitle.length > 0, 'Evolution inspector did not render the selected lineage name.');
    assert(inspected.ancestry.length > 0, 'Evolution inspector ancestry view is empty.');
    assert(inspected.traitRows === 15, `Expected 15 genome trait rows, found ${inspected.traitRows}.`);
    assert(inspected.summaryCells === 4, `Expected 4 evolution summary metrics, found ${inspected.summaryCells}.`);
    assert(inspected.inspector.lineageBrowser && inspected.inspector.ancestryView && inspected.inspector.liveGenomeDrift && inspected.inspector.gooGridBehaviorMetrics, 'Evolution inspector feature contract is incomplete.');
    assert(inspected.originStats.plantLineages >= 1, 'No plant lineage exists for inspection.');
    if (inspected.originStats.motileLineages >= 1) {
      assert(inspected.selected?.startsWith('motile-'), `Motile lineage selection failed: ${inspected.selected}`);
      assert(inspected.behaviorCells >= 1, 'Living behavior section did not render for a motile lineage.');
      assert(inspected.ancestryEvents.some(x => x.childId === inspected.selected), 'Selected motile lineage has no ancestry transition.');
    }
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'evolution-inspector.json'), JSON.stringify({ inspected, pageErrors }, null, 2));
    await page.screenshot({ path: path.join(artifactDir, 'evolution-inspector.png'), fullPage: true });
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
