const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_LEARNING_MEMORY_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'learning-memory-v52-smoke');
fs.mkdirSync(artifactDir, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--disable-dev-shm-usage','--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  try {
    await page.goto(baseUrl, { waitUntil:'domcontentloaded', timeout:120000 });
    await page.waitForFunction(() => Boolean(
      window.realitySandboxDebug?.ready &&
      window.realitySandboxOriginMotileLifeV47?.installed &&
      window.realitySandboxSensoryBrainsV50?.installed &&
      window.realitySandboxSocialSignalingV51?.installed &&
      window.realitySandboxLearningMemoryV52?.installed &&
      window.realitySandboxLearningMemoryInspectorV52a?.installed
    ), null, { timeout:120000 });

    await page.evaluate(() => window.realitySandboxDebug.advance(3600));

    const setup = await page.evaluate(() => {
      const planet = window.realitySandboxPlanet;
      const c = planet.world.ecs.components;
      const donor = window.realitySandboxOriginMotileLifeV47.getMotiles().find(x => x.position) || null;
      if (!donor) return { ok:false, reason:'no motile organism' };
      const resourceEntry = [...c.resource.entries()].find(([id, res]) => c.position.get(id) && (res.amount || 0) > 0.05);
      if (!resourceEntry) return { ok:false, reason:'no resource target' };

      for (const id of [...c.motile.keys()]) {
        if (id !== donor.id) planet.world.ecs.destroyEntity(id);
      }
      for (const [, res] of c.resource.entries()) res.amount = 0;
      for (const [, det] of c.detritus.entries()) det.amount = 0;

      const [resourceId, resource] = resourceEntry;
      const organism = c.motile.get(donor.id);
      const rp = c.position.get(resourceId);
      resource.amount = 1;
      organism.genome.brainSpeed = 1;
      organism.genome.sense = 1;
      organism.genome.motility = Math.max(0.7, organism.genome.motility || 0);
      organism.genome.heterotrophy = 1;
      organism.genome.aggression = 0;
      organism.energy = 0.65;
      organism.bioV51 = null;
      organism.bioV52 = null;
      c.position.set(donor.id, { x:rp.x + 2, y:rp.y + 2 });
      c.velocity.set(donor.id, { vx:0, vy:0 });
      return { ok:true, organismId:donor.id, lineageId:organism.lineageId, resourceId, food:{x:rp.x,y:rp.y} };
    });
    assert(setup.ok, `v52 deterministic setup failed: ${setup.reason || 'unknown'}`);

    await page.evaluate(() => window.realitySandboxDebug.advance(5));

    const learned = await page.evaluate(({ organismId }) => window.realitySandboxLearningMemoryV52.getMemory(organismId), setup);
    assert(learned?.memories?.food?.strength > 0.1, 'v52 did not form a food memory from direct experience.');

    await page.evaluate(({ organismId, resourceId }) => {
      const c = window.realitySandboxPlanet.world.ecs.components;
      const organism = c.motile.get(organismId);
      const res = c.resource.get(resourceId);
      if (res) res.amount = 0;
      for (const [, det] of c.detritus.entries()) det.amount = 0;
      const remembered = organism.bioV52?.memories?.food;
      if (remembered) c.position.set(organismId, { x:(remembered.x + 140) % window.realitySandboxPlanet.world.width, y:Math.max(0, Math.min(window.realitySandboxPlanet.world.height - 1, remembered.y + 60)) });
      c.velocity.set(organismId, { vx:0, vy:0 });
      organism.energy = Math.min(organism.energy, 0.65);
      organism.bioV50 = { ...(organism.bioV50 || {}), mode:'explore', targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null, hunger:0.8 };
    }, setup);

    await page.evaluate(() => window.realitySandboxDebug.advance(3));

    const state = await page.evaluate(({ organismId, lineageId }) => {
      const memory = window.realitySandboxLearningMemoryV52;
      const inspector = window.realitySandboxEvolutionInspectorV47b;
      const memoryInspector = window.realitySandboxLearningMemoryInspectorV52a;
      inspector.selectLineage(lineageId);
      inspector.open();
      memoryInspector.render();
      const root = document.getElementById('evolutionInspectorV47bHost')?.shadowRoot;
      return {
        stats:memory.getStats(),
        memory:memory.getMemory(organismId),
        inspectorStats:memoryInspector.getStats(),
        inspectorText:root?.querySelector('.memory-v52-body')?.textContent || '',
        diagnostics:window.realitySandboxEvolutionDiagnosticsV48d?.invariants?.() || null,
        evolutionBuild:document.documentElement.dataset.evolutionBuild,
      };
    }, setup);

    assert(state.stats.installed === true, 'v52 learning-memory module is not installed.');
    assert(state.stats.authoritativeFixedStep === true && state.stats.populationComplexity === 'O(N)', 'v52 is outside fixed-step/O(N) contract.');
    assert(state.stats.inheritedLearningRate && state.stats.inheritedMemoryRetention, 'v52 memory phenotype is not inherited.');
    assert(state.stats.directExperienceLearning && state.stats.memoryDecay && state.stats.constantMemoryPerOrganism, 'v52 learning/memory contract is incomplete.');
    assert(state.stats.memoriesFormed > 0, 'v52 formed no memories.');
    assert(state.memory?.memories?.food, 'v52 food memory vanished before inspection.');
    assert(state.stats.foodRecalls > 0 || state.memory?.recalledAction === 'seek-food', 'v52 never recalled a learned food location.');
    assert(state.inspectorStats.lineageMemoryView === true && state.inspectorText.length > 0, 'v52 inspector did not expose memory state.');
    assert(state.diagnostics?.ok === true, `Evolution diagnostics failed: ${(state.diagnostics?.failures || []).join(' | ')}`);
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'learning-memory-v52.json'), JSON.stringify({ setup, learned, state, pageErrors }, null, 2));
    await page.screenshot({ path:path.join(artifactDir, 'learning-memory-v52.png'), fullPage:true });
  } finally {
    await browser.close();
  }

  function assert(condition, message) { if (!condition) throw new Error(message); }
})().catch(error => {
  fs.writeFileSync(path.join(artifactDir, 'fatal-error.txt'), `${error.stack || error.message}\n`);
  console.error(error);
  process.exitCode = 1;
});
