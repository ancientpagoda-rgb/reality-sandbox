const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_ORIGIN_LIFE_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'origin-motile-life-smoke');
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
      window.realitySandboxPlanet?.world?.ecs?.components
    ), null, { timeout: 120000 });

    const before = await page.evaluate(() => {
      const c = window.realitySandboxPlanet.world.ecs.components;
      return {
        build: window.realitySandboxSurfaceBuild,
        agent: c.agent.size,
        predator: c.predator.size,
        apex: c.apex.size,
        motile: c.motile?.size || 0,
        resources: c.resource.size,
        stats: window.realitySandboxOriginMotileLifeV47.getStats(),
      };
    });

    assert(before.build === 'surface-v48-morphogenesis-body-plans', `Unexpected build ${before.build}`);
    assert(before.agent === 0 && before.predator === 0 && before.apex === 0, `Legacy fauna survived v47 bootstrap: ${JSON.stringify(before)}`);
    assert(before.resources > 0, 'v47 has no starting flora/resources.');
    assert(before.stats.plantFirstOrigin === true && before.stats.authoritativeFixedStep === true, 'v47 is not installed on the authoritative fixed step.');
    assert(before.stats.legacyFaunaRendererEnabled === false, 'Legacy fauna rendering was re-enabled.');

    await page.evaluate(() => window.realitySandboxDebug.advance(3000));

    const after = await page.evaluate(() => {
      const c = window.realitySandboxPlanet.world.ecs.components;
      const api = window.realitySandboxOriginMotileLifeV47;
      return {
        agent: c.agent.size,
        predator: c.predator.size,
        apex: c.apex.size,
        motile: c.motile?.size || 0,
        stats: api.getStats(),
        lineages: api.getLineages(),
        ancestry: api.getAncestry(),
        motiles: api.getMotiles().slice(0, 20),
        retiredSurfaceFaunaModules: {
          creaturesV44: Boolean(window.realitySandboxSurfaceCreaturesV44),
          localFaunaV44d: Boolean(window.realitySandboxSurfaceLocalFaunaV44d),
          faunaGuaranteeV45b: Boolean(window.realitySandboxSurfaceFaunaGuaranteeV45b),
          faunaExactV46d: Boolean(window.realitySandboxSurfaceFaunaExactV46d),
        },
      };
    });

    assert(after.agent === 0 && after.predator === 0 && after.apex === 0, 'Legacy hand-seeded fauna returned after simulation advance.');
    assert(after.stats.ticks >= 100, `v47 biology barely advanced (${after.stats.ticks} ticks).`);
    assert(after.stats.plantLineages >= 1 && after.stats.plantIndividuals > 0, 'Plant evolutionary lineages were not established.');
    assert(after.stats.originsFromPlants >= 1, 'No plant lineage crossed into motile life.');
    assert(after.stats.motileLineages >= 1 && after.stats.motilePopulation >= 1 && after.motile >= 1, 'Motile descendants did not persist as real ECS entities.');
    assert(after.stats.hardPopulationCap === false && after.stats.hardDisplayCap === false, 'v47 introduced a hard population/display cap.');
    assert(after.stats.gooGridInspiredTraits.includes('brainSpeed') && after.stats.gooGridInspiredTraits.includes('sleepDebt') && after.stats.gooGridInspiredTraits.includes('toxin'), 'GooGrid-inspired inherited traits are missing.');
    assert(after.lineages.some(x => x.type === 'motile' && x.parentId?.startsWith('flora-')), 'No motile lineage records a photosynthetic ancestor.');
    assert(after.ancestry.some(x => x.parentId?.startsWith('flora-') && x.childId?.startsWith('motile-')), 'Plant-to-motile ancestry transition was not recorded.');
    assert(after.motiles.every(x => Number.isFinite(x.genome.photosynthesis) && Number.isFinite(x.genome.heterotrophy) && Number.isFinite(x.genome.motility) && Number.isFinite(x.genome.brainSpeed)), 'Motile genomes are incomplete.');
    assert(Object.values(after.retiredSurfaceFaunaModules).every(value => value === false), 'A retired Surface-fauna module loaded in v47.');
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'origin-motile-life.json'), JSON.stringify({ before, after, pageErrors }, null, 2));
    await page.screenshot({ path: path.join(artifactDir, 'origin-motile-life.png'), fullPage: true });
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
