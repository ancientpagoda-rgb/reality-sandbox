const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_FAST_MOTILE_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'ci-fast-motile-bootstrap');
fs.mkdirSync(artifactDir, { recursive:true });

(async () => {
  const browser = await chromium.launch({
    headless:true,
    args:['--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--disable-dev-shm-usage','--no-sandbox'],
  });
  const page = await browser.newPage({ viewport:{ width:1280, height:800 }, deviceScaleFactor:1 });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  try {
    await page.goto(baseUrl, { waitUntil:'domcontentloaded', timeout:120000 });
    await page.waitForFunction(() => Boolean(
      window.realitySandboxDebug?.ready &&
      window.realitySandboxOriginMotileLifeV47?.installed &&
      window.realitySandboxOriginMotileLifeV47?.ciFastMotileFixtureAvailable
    ), null, { timeout:120000 });

    const result = await page.evaluate(() => {
      const debug = window.realitySandboxDebug;
      const origin = window.realitySandboxOriginMotileLifeV47;
      const before = debug.snapshot().tick;
      const beforeStats = origin.getStats();
      debug.advance(3600);
      const after = debug.snapshot().tick;
      const afterStats = origin.getStats();
      const motiles = origin.getMotiles();
      const lineages = origin.getLineages();
      const ancestry = origin.getAncestry();

      const oneBefore = debug.snapshot().tick;
      debug.advance(1);
      const oneAfter = debug.snapshot().tick;

      return {
        tickDelta:after - before,
        ordinaryAdvanceDelta:oneAfter - oneBefore,
        beforeStats,
        afterStats,
        motileCount:motiles.length,
        motilesWithPosition:motiles.filter(item => item.position).length,
        motileLineages:lineages.filter(item => item.type === 'motile').length,
        originTransitions:ancestry.filter(item => item.transition && String(item.childId || '').startsWith('motile-')).length,
        webdriver:navigator.webdriver,
        host:location.hostname,
      };
    });

    assert(result.webdriver === true, 'Playwright did not expose webdriver automation state.');
    assert(result.host === '127.0.0.1' || result.host === 'localhost', `Unexpected non-local host ${result.host}.`);
    assert(result.beforeStats.ciFastMotileFixtureAvailable === true, 'Fast motile fixture was not available in local automation.');
    assert(result.afterStats.ciFastMotileFixturePrimed === true, 'Fast motile fixture did not report successful priming.');
    assert(result.afterStats.ciFastMotileFixtureFallbacks === 0, 'Fast motile fixture fell back to the full 3,600-tick path.');
    assert(result.tickDelta >= 30 && result.tickDelta <= 60, `advance(3600) consumed ${result.tickDelta} fixed ticks instead of the fast bootstrap.`);
    assert(result.ordinaryAdvanceDelta === 1, `Ordinary debug advance was changed (${result.ordinaryAdvanceDelta}).`);
    assert(result.afterStats.originsFromPlants >= 1, 'v47 did not record a plant-originated motile transition.');
    assert(result.afterStats.motilePopulation >= 1 && result.motileCount >= 1 && result.motilesWithPosition >= 1, 'Fast bootstrap produced no valid motile organism.');
    assert(result.motileLineages >= 1 && result.originTransitions >= 1, 'Fast bootstrap bypassed normal lineage/ancestry creation.');
    assert(result.afterStats.plantFirstOrigin === true && result.afterStats.authoritativeFixedStep === true, 'Fast bootstrap broke v47 plant-first/fixed-step invariants.');
    assert(result.afterStats.hardPopulationCap === false && result.afterStats.hardDisplayCap === false, 'Fast bootstrap introduced a cap.');
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'ci-fast-motile-bootstrap.json'), JSON.stringify({ result, pageErrors }, null, 2));
    console.log('Fast motile bootstrap passed:', JSON.stringify({
      tickDelta:result.tickDelta,
      motilePopulation:result.afterStats.motilePopulation,
      originsFromPlants:result.afterStats.originsFromPlants,
      fallbacks:result.afterStats.ciFastMotileFixtureFallbacks,
    }));
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