const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_PROTO_LANGUAGE_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'proto-language-v54-smoke');
fs.mkdirSync(artifactDir, { recursive:true });

(async () => {
  const browser = await chromium.launch({ headless:true, args:['--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--disable-dev-shm-usage','--no-sandbox'] });
  const page = await browser.newPage({ viewport:{ width:1280, height:800 }, deviceScaleFactor:1 });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  try {
    await page.goto(baseUrl, { waitUntil:'domcontentloaded', timeout:120000 });
    await page.waitForFunction(() => Boolean(
      window.realitySandboxDebug?.ready &&
      window.realitySandboxProtoCultureV53?.installed &&
      window.realitySandboxProtoLanguageV54?.installed &&
      window.realitySandboxProtoLanguageInspectorV54a?.installed
    ), null, { timeout:120000 });

    await page.evaluate(() => window.realitySandboxDebug.advance(3600));

    const setup = await page.evaluate(() => {
      const planet = window.realitySandboxPlanet;
      const c = planet.world.ecs.components;
      const donor = window.realitySandboxOriginMotileLifeV47.getMotiles().find(x => x.position) || null;
      if (!donor) return { ok:false, reason:'no motile speaker available' };
      for (const id of [...c.motile.keys()]) if (id !== donor.id) planet.world.ecs.destroyEntity(id);
      for (const [, res] of c.resource.entries()) res.amount = 0;
      for (const [, det] of c.detritus.entries()) det.amount = 0;

      const teacher = c.motile.get(donor.id);
      const base = donor.position || { x:planet.world.width * 0.45, y:planet.world.height * 0.48 };
      const target = { x:(base.x + 150) % planet.world.width, y:Math.max(25, Math.min(planet.world.height - 25, base.y + 50)) };
      Object.assign(teacher.genome, { brainSpeed:1, sense:1, sociality:1, heterotrophy:1, motility:Math.max(0.8, teacher.genome.motility || 0), aggression:0.1 });
      teacher.energy = 0.85;
      teacher.age = 10;
      teacher.state = 'awake';
      teacher.bioV50 = { mode:'explore', drives:{ explore:1 }, hunger:0.8, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null };
      teacher.bioV51 = null;
      teacher.bioV52 = { learningRate:1, retention:0.94, memories:{ food:null, danger:null, hunt:null }, recalledAction:null, recalledMemory:null, lastEnergy:0.85, formedAtStep:0, lastSocialReceivedAtStep:null };
      teacher.bioV53 = { openness:1, conformity:1, practices:{ 'food-route':{ x:target.x, y:target.y, targetId:null, strength:1, modelId:teacher.lineageId, learnedAtStep:0, updatedAtStep:0 }, 'danger-avoidance':null, 'pack-hunt':null }, appliedPractice:'food-route', learnedFrom:null, lastEnergy:0.85, culturalAge:5 };
      teacher.bioV54 = null;
      c.position.set(donor.id, { x:base.x, y:base.y });
      c.velocity.set(donor.id, { vx:0, vy:0 });

      const learnerId = planet.world.ecs.createEntity();
      c.position.set(learnerId, { x:base.x + 4, y:base.y + 3 });
      c.velocity.set(learnerId, { vx:0, vy:0 });
      c.motile.set(learnerId, {
        lineageId:teacher.lineageId,
        generation:(teacher.generation || 0) + 1,
        plantAncestorId:teacher.plantAncestorId,
        energy:0.85,
        age:6,
        state:'awake',
        sleepDebt:0.1,
        decisionCooldown:0,
        neurotoxinLoad:0,
        genome:{ ...teacher.genome, brainSpeed:0.45, sense:0.45, sociality:0 },
        bioV50:{ mode:'explore', drives:{ explore:1 }, hunger:0.8, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null },
        bioV51:null,
        bioV52:{ learningRate:0.45, retention:0.7, memories:{ food:null, danger:null, hunt:null }, recalledAction:null, recalledMemory:null, lastEnergy:0.85, formedAtStep:0, lastSocialReceivedAtStep:null },
        bioV53:{ openness:0.4, conformity:0.2, practices:{ 'food-route':null, 'danger-avoidance':null, 'pack-hunt':null }, appliedPractice:null, learnedFrom:null, lastEnergy:0.85, culturalAge:0 },
      });
      return { ok:true, teacherId:donor.id, learnerId, lineageId:teacher.lineageId, target };
    });
    assert(setup.ok, `v54 deterministic setup failed: ${setup.reason || 'unknown'}`);

    // debug.advance() takes fixed 0.06 s simulation ticks, not seconds.
    await page.evaluate(() => window.realitySandboxDebug.advance(90));

    const learned = await page.evaluate(({ teacherId, learnerId }) => ({
      teacher:window.realitySandboxProtoLanguageV54.getLanguage(teacherId),
      learner:window.realitySandboxProtoLanguageV54.getLanguage(learnerId),
    }), setup);
    const teacherToken = learned.teacher?.production?.['food-route'];
    assert(teacherToken, 'Teacher invented no arbitrary food-route symbol.');
    assert(!learned.learner?.lastEmission, 'Naive learner vocalized before acquiring the teacher convention.');
    assert(learned.learner?.lexicon?.[teacherToken]?.meaning === 'food-route', 'Learner did not acquire the teacher symbol meaning by association.');
    assert(learned.learner.lexicon[teacherToken].confidence >= 0.34, 'Learner symbol association remained below interpretation threshold.');

    const listener = await page.evaluate(({ teacherId, learnerId, target }) => {
      const planet = window.realitySandboxPlanet;
      const c = planet.world.ecs.components;
      const learner = c.motile.get(learnerId);
      planet.world.ecs.destroyEntity(teacherId);
      learner.genome.brainSpeed = 1;
      learner.genome.sense = 1;
      learner.genome.sociality = 1;
      learner.bioV53.practices['food-route'] = { x:target.x, y:target.y, targetId:null, strength:1, modelId:learnerId, learnedAtStep:0, updatedAtStep:0 };
      learner.bioV53.appliedPractice = 'food-route';
      learner.bioV50 = { ...(learner.bioV50 || {}), mode:'explore', drives:{ explore:1 }, hunger:0.8, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null };
      const lp = c.position.get(learnerId);

      const listenerId = planet.world.ecs.createEntity();
      c.position.set(listenerId, { x:lp.x + 5, y:lp.y + 2 });
      c.velocity.set(listenerId, { vx:0, vy:0 });
      c.motile.set(listenerId, {
        lineageId:learner.lineageId,
        generation:(learner.generation || 0) + 1,
        plantAncestorId:learner.plantAncestorId,
        energy:0.85,
        age:5,
        state:'awake',
        sleepDebt:0.1,
        decisionCooldown:0,
        neurotoxinLoad:0,
        genome:{ ...learner.genome, brainSpeed:0.45, sense:0.45, sociality:0 },
        bioV50:{ mode:'explore', drives:{ explore:1 }, hunger:0.8, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null },
        bioV51:null,
        bioV52:{ learningRate:0.45, retention:0.7, memories:{ food:null, danger:null, hunt:null }, recalledAction:null, recalledMemory:null, lastEnergy:0.85, formedAtStep:0, lastSocialReceivedAtStep:null },
        bioV53:{ openness:0.4, conformity:0.2, practices:{ 'food-route':{ x:target.x, y:target.y, targetId:null, strength:0.8, modelId:learnerId, learnedAtStep:0, updatedAtStep:0 }, 'danger-avoidance':null, 'pack-hunt':null }, appliedPractice:null, learnedFrom:learnerId, lastEnergy:0.85, culturalAge:0 },
      });
      return { listenerId };
    }, setup);

    await page.evaluate(() => window.realitySandboxDebug.advance(75));

    const state = await page.evaluate(({ learnerId, lineageId, listenerId }) => {
      const language = window.realitySandboxProtoLanguageV54;
      const inspector = window.realitySandboxEvolutionInspectorV47b;
      const languageInspector = window.realitySandboxProtoLanguageInspectorV54a;
      inspector.selectLineage(lineageId);
      inspector.open();
      languageInspector.render();
      const root = document.getElementById('evolutionInspectorV47bHost')?.shadowRoot;
      return {
        stats:language.getStats(),
        learner:language.getLanguage(learnerId),
        listener:language.getLanguage(listenerId),
        inspectorStats:languageInspector.getStats(),
        inspectorText:root?.querySelector('.language-v54-body')?.textContent || '',
        diagnostics:window.realitySandboxEvolutionDiagnosticsV48d?.invariants?.() || null,
        evolutionBuild:document.documentElement.dataset.evolutionBuild,
      };
    }, { ...setup, ...listener });

    assert(state.stats.installed === true, 'v54 proto-language is not installed.');
    assert(state.stats.semanticallyNeutralTokens && state.stats.meaningAcquiredByAssociation && state.stats.learnedSymbolMeanings, 'v54 symbols have hard-coded or unlearned meaning.');
    assert(state.stats.physicallyLocalTransmission && state.stats.kinBiasedTransmission && state.stats.spatialHashing, 'v54 language transmission is not physically local/spatially hashed.');
    assert(state.stats.culturallyBlankLexiconAtBirth && state.stats.learnedConventionsCanBeProduced, 'v54 conventions are not culturally learned.');
    assert(state.stats.boundedLexicon && state.stats.maxLexiconEntries === state.stats.tokenInventory.length, 'v54 lexicon is not bounded.');
    assert(state.stats.symbolEmissions > 0 && state.stats.symbolHearings > 0 && state.stats.associationsLearned > 0, 'v54 recorded no symbol-learning cycle.');
    assert(state.learner?.lastEmission?.token === teacherToken || state.learner?.production?.['food-route'] === teacherToken, 'Learner did not reproduce the teacher convention after teacher removal.');
    assert(state.listener?.lexicon?.[teacherToken]?.meaning === 'food-route', 'A later listener did not acquire the reproduced convention.');
    assert(state.stats.successfulInterpretations > 0, 'v54 recorded no successful learned-symbol interpretation.');
    assert(state.stats.symbolicGuidanceEvents > 0 || state.listener?.appliedLanguageAction === 'food-route', 'Learned symbolic meaning never influenced behavior.');
    assert(state.stats.sharedConventions > 0, 'No symbol convention became shared by multiple organisms.');
    assert(state.inspectorStats.lineageLexiconView && state.inspectorStats.sharedConventionView && state.inspectorText.length > 0, 'v54 inspector did not expose learned symbolic conventions.');
    assert(state.evolutionBuild === 'evolution-v54-proto-language', `Unexpected evolution build ${state.evolutionBuild}.`);
    assert(state.diagnostics?.ok === true, `Evolution diagnostics failed: ${(state.diagnostics?.failures || []).join(' | ')}`);
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'proto-language-v54.json'), JSON.stringify({ setup, learned, listener, state, pageErrors }, null, 2));
    await page.screenshot({ path:path.join(artifactDir, 'proto-language-v54.png'), fullPage:true });
  } finally {
    await browser.close();
  }

  function assert(condition, message) { if (!condition) throw new Error(message); }
})().catch(error => {
  fs.writeFileSync(path.join(artifactDir, 'fatal-error.txt'), `${error.stack || error.message}\n`);
  console.error(error);
  process.exitCode = 1;
});
