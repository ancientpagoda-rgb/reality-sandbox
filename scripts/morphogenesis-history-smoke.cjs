const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_MORPHOGENESIS_HISTORY_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'morphogenesis-history-smoke');
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
      window.realitySandboxEvolutionInspectorV47b?.installed &&
      window.realitySandboxMorphogenesisV48?.installed &&
      window.realitySandboxMorphogenesisSelectionV48b?.installed &&
      window.realitySandboxMorphogenesisHistoryV48c?.installed
    ), null, { timeout: 120000 });

    await page.evaluate(() => window.realitySandboxDebug.advance(3000));
    await page.evaluate(() => window.realitySandboxEvolutionInspectorV47b.open());

    const result = await page.evaluate(() => {
      const origin = window.realitySandboxOriginMotileLifeV47;
      const inspector = window.realitySandboxEvolutionInspectorV47b;
      const history = window.realitySandboxMorphogenesisHistoryV48c;
      const lineages = origin.getLineages();
      const motile = lineages.find(lineage => lineage.type === 'motile' && lineage.population > 0) || lineages.find(lineage => lineage.type === 'motile');
      if (!motile) return { missingMotileLineage: true };
      inspector.selectLineage(motile.id);
      history.sample();
      history.render();
      const host = document.getElementById('evolutionInspectorV47bHost');
      const root = host?.shadowRoot;
      return {
        missingMotileLineage: false,
        build: window.realitySandboxSurfaceBuild,
        selectedLineageId: motile.id,
        stats: history.getStats(),
        events: history.getEvents(motile.id),
        uiRows: root?.querySelectorAll('.body-history-event-v48c')?.length || 0,
        uiText: root?.querySelector('.body-history-list-v48c')?.textContent || '',
      };
    });

    assert(!result.missingMotileLineage, 'v48c history smoke found no motile lineage after deep-time advance.');
    assert(result.build === 'surface-v48-morphogenesis-body-plans', `Unexpected build ${result.build}.`);
    assert(result.stats.authoritativeFixedStep && result.stats.firstObservedBodyPlans && result.stats.lineageBodyPlanFirstEmergence, 'v48c body-plan history is not on the authoritative evolutionary clock.');
    assert(result.stats.developmentalThresholdHistory && result.stats.deepTimeLabels && result.stats.habitatContext, 'v48c historical explanation contract is incomplete.');
    assert(result.stats.samples >= 1, 'v48c never sampled body-plan history.');
    assert(result.events.length >= 1, 'Selected motile lineage has no body-plan history event.');
    assert(result.events.every(event => Number.isFinite(event.years) && typeof event.timeLabel === 'string' && event.timeLabel.length > 0), 'A v48c body-plan event lacks deep-time coordinates.');
    assert(result.events.some(event => event.type === 'first-observed-body-plan' || event.type === 'body-plan' || event.type === 'developmental-threshold'), 'v48c history has no recognized body-plan event type.');
    assert(result.events.every(event => typeof event.context === 'string' && event.context.length > 0), 'A v48c body-plan event lacks habitat context.');
    assert(result.events.some(event => /favored|habitat/.test(event.context)), 'Selected lineage history never recorded developmental habitat context.');
    assert(result.uiRows >= 1, 'v48c body-plan history did not render in the inspector.');
    assert(/Myr|kyr|yr/.test(result.uiText), 'v48c inspector history does not display deep-time labels.');
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'morphogenesis-history.json'), JSON.stringify({ result, pageErrors }, null, 2));
    await page.screenshot({ path: path.join(artifactDir, 'morphogenesis-history.png'), fullPage: true });
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