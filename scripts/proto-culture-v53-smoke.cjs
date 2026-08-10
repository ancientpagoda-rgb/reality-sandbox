const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_PROTO_CULTURE_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'proto-culture-v53-smoke');
fs.mkdirSync(artifactDir, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless:true, args:['--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--disable-dev-shm-usage','--no-sandbox'] });
  const page = await browser.newPage({ viewport:{ width:1280, height:800 }, deviceScaleFactor:1 });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  try {
    await page.goto(baseUrl, { waitUntil:'domcontentloaded', timeout:120000 });
    await page.waitForFunction(() => Boolean(
      window.realitySandboxDebug?.ready &&
      window.realitySandboxLearningMemoryV52?.installed &&
      window.realitySandboxProtoCultureV53?.installed &&
      window.realitySandboxProtoCultureInspectorV53a?.installed
    ), null, { timeout:120000 });

    await page.evaluate(() => window.realitySandboxDebug.advance(3600));

    const setup = await page.evaluate(() => {
      const planet = window.realitySandboxPlanet;
      const c = planet.world.ecs.components;
      const donor = window.realitySandboxOriginMotileLifeV47.getMotiles().find(x => x.position) || null;
      if (!donor) return { ok:false, reason:'no motile teacher available' };

      for (const id of [...c.motile.keys()]) if (id !== donor.id) planet.world.ecs.destroyEntity(id);
      for (const [, res] of c.resource.entries()) res.amount = 0;
      for (const [, det] of c.detritus.entries()) det.amount = 0;

      const teacher = c.motile.get(donor.id);
      const basePos = donor.position || { x:planet.world.width * 0.4, y:planet.world.height * 0.5 };
      const target = { x:(basePos.x + 160) % planet.world.width, y:Math.max(20, Math.min(planet.world.height - 20, basePos.y + 45)) };
      teacher.genome.brainSpeed = 1;
      teacher.genome.sense = 1;
      teacher.genome.sociality = 1;
      teacher.genome.motility = Math.max(0.8, teacher.genome.motility || 0);
      teacher.genome.heterotrophy = 1;
      teacher.genome.aggression = 0.1;
      teacher.energy = 0.9;
      teacher.age = 5;
      teacher.bioV50 = { mode:'explore', drives:{ explore:1 }, hunger:0.8, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null };
      teacher.bioV51 = null;
      teacher.bioV52 = {
        learningRate:1,
        retention:0.94,
        memories:{ food:{ x:target.x, y:target.y, strength:1, targetId:null, source:'direct', updatedAtStep:0 }, danger:null, hunt:null },
        recalledAction:null,
        recalledMemory:null,
        lastEnergy:teacher.energy,
        formedAtStep:0,
        lastSocialReceivedAtStep:null,
      };
      teacher.bioV53 = null;
      c.position.set(donor.id, { x:basePos.x, y:basePos.y });
      c.velocity.set(donor.id, { vx:0, vy:0 });

      const learnerId = planet.world.ecs.createEntity();
      c.position.set(learnerId, { x:basePos.x + 4, y:basePos.y + 3 });
      c.velocity.set(learnerId, { vx:0, vy:0 });
      c.motile.set(learnerId, {
        lineageId:teacher.lineageId,
        generation:(teacher.generation || 0) + 1,
        plantAncestorId:teacher.plantAncestorId,
        energy:0.9,
        age:5,
        state:'awake',
        sleepDebt:0.1,
        decisionCooldown:0,
        neurotoxinLoad:0,
        genome:{ ...teacher.genome, brainSpeed:1, sense:1, sociality:1, motility:Math.max(0.8, teacher.genome.motility || 0), heterotrophy:1, aggression:0.1 },
        bioV50:{ mode:'explore', drives:{ explore:1 }, hunger:0.8, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null },
        bioV51:null,
        bioV52:{ learningRate:1, retention:0.94, memories:{ food:null, danger:null, hunt:null }, recalledAction:null, recalledMemory:null, lastEnergy:0.9, formedAtStep:0, lastSocialReceivedAtStep:null },
      });
      return { ok:true, teacherId:donor.id, learnerId, lineageId:teacher.lineageId, target };
    });
    assert(setup.ok, `v53 deterministic setup failed: ${setup.reason || 'unknown'}`);

    // debug.advance() takes fixed 0.06 s simulation ticks, not seconds.
    await page.evaluate(() => window.realitySandboxDebug.advance(75));

    const learned = await page.evaluate(({ learnerId }) => window.realitySandboxProtoCultureV53.getCulture(learnerId), setup);
    assert(learned?.practices?.['food-route']?.strength > 0.24, 'Naive kin did not adopt the demonstrated food-route tradition.');
    assert(learned.learnedFrom === setup.teacherId, 'Learner did not retain the physical demonstrator as its cultural source.');

    await page.evaluate(({ teacherId, learnerId }) => {
      const planet = window.realitySandboxPlanet;
      const c = planet.world.ecs.components;
      planet.world.ecs.destroyEntity(teacherId);
      const learner = c.motile.get(learnerId);
      if (learner?.bioV52) {
        learner.bioV52.memories = { food:null, danger:null, hunt:null };
        learner.bioV52.recalledAction = null;
        learner.bioV52.recalledMemory = null;
      }
      if (learner) {
        learner.energy = Math.min(0.9, learner.energy || 0.9);
        learner.bioV50 = { ...(learner.bioV50 || {}), mode:'explore', drives:{ explore:1 }, hunger:0.8, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null };
      }
      c.velocity.set(learnerId, { vx:0, vy:0 });
    }, setup);

    await page.evaluate(() => window.realitySandboxDebug.advance(60));

    const state = await page.evaluate(({ learnerId, lineageId }) => {
      const culture = window.realitySandboxProtoCultureV53;
      const inspector = window.realitySandboxEvolutionInspectorV47b;
      const cultureInspector = window.realitySandboxProtoCultureInspectorV53a;
      inspector.selectLineage(lineageId);
      inspector.open();
      cultureInspector.render();
      const root = document.getElementById('evolutionInspectorV47bHost')?.shadowRoot;
      return {
        stats:culture.getStats(),
        learner:culture.getCulture(learnerId),
        inspectorStats:cultureInspector.getStats(),
        inspectorText:root?.querySelector('.culture-v53-body')?.textContent || '',
        diagnostics:window.realitySandboxEvolutionDiagnosticsV48d?.invariants?.() || null,
        evolutionBuild:document.documentElement.dataset.evolutionBuild,
      };
    }, setup);

    assert(state.stats.installed === true, 'v53 proto-culture is not installed.');
    assert(state.stats.nonGeneticTransmission && state.stats.physicallyLocalObservation && state.stats.kinBiasedTransmission, 'v53 cultural transmission contract is incomplete.');
    assert(state.stats.culturallyBlankNewborns && state.stats.learnedTraditionsAffectBehavior && state.stats.intergenerationalSocialLearning, 'v53 does not preserve learned/non-genetic cultural inheritance semantics.');
    assert(state.stats.spatialHashing && state.stats.authoritativeFixedStep, 'v53 is outside the spatial-hash/fixed-step contract.');
    assert(state.stats.adoptions > 0 && state.stats.observations > 0, 'v53 recorded no physical cultural learning event.');
    assert(state.stats.intergenerationalTransmissions > 0, 'v53 recorded no cross-generation cultural transmission.');
    assert(state.learner?.practices?.['food-route'], 'The learned tradition did not persist after the demonstrator was removed.');
    assert(state.stats.foodRouteGuidance > 0 || state.learner?.appliedPractice === 'food-route', 'The learned tradition never affected later behavior.');
    assert(state.inspectorStats.lineageTraditionView && state.inspectorText.length > 0, 'v53 inspector did not expose lineage traditions.');
    assert(state.diagnostics?.ok === true, `Evolution diagnostics failed: ${(state.diagnostics?.failures || []).join(' | ')}`);
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'proto-culture-v53.json'), JSON.stringify({ setup, learned, state, pageErrors }, null, 2));
    await page.screenshot({ path:path.join(artifactDir, 'proto-culture-v53.png'), fullPage:true });
  } finally {
    await browser.close();
  }

  function assert(condition, message) { if (!condition) throw new Error(message); }
})().catch(error => {
  fs.writeFileSync(path.join(artifactDir, 'fatal-error.txt'), `${error.stack || error.message}\n`);
  console.error(error);
  process.exitCode = 1;
});
