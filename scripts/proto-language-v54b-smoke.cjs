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
      const base = { x:planet.world.width * 0.42, y:planet.world.height * 0.48 };
      const target = { x:(base.x + 130) % planet.world.width, y:Math.max(24, Math.min(planet.world.height - 24, base.y + 45)) };
      Object.assign(teacher.genome, { brainSpeed:1, sense:0, sociality:0, motility:0, heterotrophy:1, aggression:0.1 });
      teacher.energy = 0.82;
      teacher.age = 10;
      teacher.state = 'awake';
      teacher.bioV50 = { mode:'explore', drives:{ explore:1 }, hunger:0.7, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null };
      teacher.bioV51 = null;
      teacher.bioV52 = { learningRate:0.62, retention:0.72, memories:{ food:null, danger:null, hunt:null }, recalledAction:null, recalledMemory:null, lastEnergy:0.82, formedAtStep:0, lastSocialReceivedAtStep:null };
      teacher.bioV53 = { openness:0.53, conformity:0.23, practices:{ 'food-route':{ x:target.x, y:target.y, targetId:null, strength:1, modelId:teacher.lineageId, learnedAtStep:0, updatedAtStep:0 }, 'danger-avoidance':null, 'pack-hunt':null }, appliedPractice:'food-route', learnedFrom:null, lastEnergy:0.82, culturalAge:5 };
      teacher.bioV54 = null;
      c.position.set(donor.id, base);
      c.velocity.set(donor.id, { vx:0, vy:0 });

      function addReceiver(x, grounded) {
        const id = planet.world.ecs.createEntity();
        c.position.set(id, { x, y:base.y });
        c.velocity.set(id, { vx:0, vy:0 });
        c.motile.set(id, {
          lineageId:teacher.lineageId,
          generation:(teacher.generation || 0) + 1,
          plantAncestorId:teacher.plantAncestorId,
          energy:0.82,
          age:6,
          state:'awake',
          sleepDebt:0.1,
          decisionCooldown:0,
          neurotoxinLoad:0,
          genome:{ ...teacher.genome, brainSpeed:1, sense:0, sociality:0, motility:0 },
          bioV50:{ mode:'explore', drives:{ explore:1 }, hunger:0.7, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null },
          bioV51:null,
          bioV52:{ learningRate:0.62, retention:0.72, memories:{ food:grounded ? { x:target.x, y:target.y, strength:1, targetId:null, source:'direct', updatedAtStep:0 } : null, danger:null, hunt:null }, recalledAction:null, recalledMemory:null, lastEnergy:0.82, formedAtStep:0, lastSocialReceivedAtStep:null },
          bioV53:{ openness:0.53, conformity:0.23, practices:{ 'food-route':null, 'danger-avoidance':null, 'pack-hunt':null }, appliedPractice:null, learnedFrom:null, lastEnergy:0.82, culturalAge:0 },
          bioV54:null,
        });
        return id;
      }

      // sense/social=0 gives v53 radius 36, v54 radius 42. Both receivers are 38 away:
      // they can hear the symbol but cannot copy the v53 tradition.
      const learnerId = addReceiver((base.x + 38) % planet.world.width, true);
      const naiveId = addReceiver((base.x - 38 + planet.world.width) % planet.world.width, false);
      return { ok:true, teacherId:donor.id, learnerId, naiveId, lineageId:teacher.lineageId, target };
    });
    assert(setup.ok, `v54b setup failed: ${setup.reason || 'unknown'}`);

    await page.evaluate(() => window.realitySandboxDebug.advance(75));

    const learned = await page.evaluate(({ teacherId, learnerId, naiveId }) => ({
      teacher:window.realitySandboxProtoLanguageV54.getLanguage(teacherId),
      learner:window.realitySandboxProtoLanguageV54.getLanguage(learnerId),
      naive:window.realitySandboxProtoLanguageV54.getLanguage(naiveId),
      learnerCulture:window.realitySandboxProtoCultureV53.getCulture(learnerId),
      naiveCulture:window.realitySandboxProtoCultureV53.getCulture(naiveId),
    }), setup);

    const teacherToken = learned.teacher?.production?.['food-route'];
    assert(teacherToken, 'Teacher invented no food-route symbol.');
    assert(learned.learner?.lexicon?.[teacherToken]?.meaning === 'food-route', 'Grounded learner did not associate the heard symbol with its own food experience.');
    assert((learned.learner.lexicon[teacherToken].confidence || 0) >= 0.34, 'Grounded learner association remained below interpretation threshold.');
    assert(!learned.naive?.lexicon?.[teacherToken], 'Ungrounded listener learned a symbol meaning without independent context.');
    assert(!learned.learnerCulture?.practices?.['food-route'] && !learned.naiveCulture?.practices?.['food-route'], 'v53 tradition leaked across the 38-unit language-only window.');

    const listener = await page.evaluate(({ teacherId, learnerId, naiveId, target }) => {
      const planet = window.realitySandboxPlanet;
      const c = planet.world.ecs.components;
      planet.world.ecs.destroyEntity(teacherId);
      planet.world.ecs.destroyEntity(naiveId);
      const learner = c.motile.get(learnerId);
      const lp = c.position.get(learnerId);
      learner.bioV52.memories.food = { x:target.x, y:target.y, strength:1, targetId:null, source:'direct', updatedAtStep:0 };
      learner.bioV50 = { ...(learner.bioV50 || {}), mode:'explore', drives:{ explore:1 }, hunger:0.7, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null };

      const listenerId = planet.world.ecs.createEntity();
      c.position.set(listenerId, { x:(lp.x + 38) % planet.world.width, y:lp.y });
      c.velocity.set(listenerId, { vx:0, vy:0 });
      c.motile.set(listenerId, {
        lineageId:learner.lineageId,
        generation:(learner.generation || 0) + 1,
        plantAncestorId:learner.plantAncestorId,
        energy:0.82,
        age:5,
        state:'awake',
        sleepDebt:0.1,
        decisionCooldown:0,
        neurotoxinLoad:0,
        genome:{ ...learner.genome, brainSpeed:1, sense:0, sociality:0, motility:0 },
        bioV50:{ mode:'explore', drives:{ explore:1 }, hunger:0.7, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null },
        bioV51:null,
        bioV52:{ learningRate:0.62, retention:0.72, memories:{ food:{ x:target.x, y:target.y, strength:1, targetId:null, source:'direct', updatedAtStep:0 }, danger:null, hunt:null }, recalledAction:null, recalledMemory:null, lastEnergy:0.82, formedAtStep:0, lastSocialReceivedAtStep:null },
        bioV53:{ openness:0.53, conformity:0.23, practices:{ 'food-route':null, 'danger-avoidance':null, 'pack-hunt':null }, appliedPractice:null, learnedFrom:null, lastEnergy:0.82, culturalAge:0 },
        bioV54:null,
      });
      return { listenerId };
    }, setup);

    await page.evaluate(() => window.realitySandboxDebug.advance(75));

    const copied = await page.evaluate(({ learnerId, listenerId }) => ({
      learner:window.realitySandboxProtoLanguageV54.getLanguage(learnerId),
      listener:window.realitySandboxProtoLanguageV54.getLanguage(listenerId),
    }), { ...setup, ...listener });
    assert(copied.learner?.production?.['food-route'] === teacherToken, 'Learner did not reproduce the learned convention after teacher removal.');
    assert(copied.listener?.lexicon?.[teacherToken]?.meaning === 'food-route', 'Later grounded listener did not acquire the reproduced convention.');

    // Suppress v52 food recall while retaining a target, so the learned symbol itself can steer.
    await page.evaluate(({ listenerId }) => {
      const c = window.realitySandboxPlanet.world.ecs.components;
      const listener = c.motile.get(listenerId);
      listener.bioV50 = { ...(listener.bioV50 || {}), mode:'flock', drives:{ flock:1 }, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null };
      listener.bioV52.recalledAction = null;
      listener.bioV52.recalledMemory = null;
      c.velocity.set(listenerId, { vx:0, vy:0 });
    }, listener);
    await page.evaluate(() => window.realitySandboxDebug.advance(30));

    const state = await page.evaluate(({ learnerId, listenerId, lineageId }) => {
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
      };
    }, { ...setup, ...listener });

    assert(state.stats.version === 'v54b-receiver-grounded', 'Receiver-grounded v54b runtime is not active.');
    assert(state.stats.receiverGroundedAssociations && state.stats.noSpeakerMeaningMetadata, 'v54b grounding contract is incomplete.');
    assert(state.stats.groundedHearings > 0 && state.stats.ungroundedHearings > 0, 'v54b did not exercise both grounded and ungrounded hearings.');
    assert(state.stats.physicallyLocalTransmission && state.stats.kinBiasedTransmission && state.stats.spatialHashing, 'v54b transmission contract failed.');
    assert(state.stats.boundedLexicon && state.stats.culturallyBlankLexiconAtBirth && state.stats.learnedConventionsCanBeProduced, 'v54b cultural-learning contract failed.');
    assert(state.stats.symbolicGuidanceEvents > 0 || state.listener?.appliedLanguageAction === 'food-route', 'Learned symbol never affected behavior.');
    assert(state.stats.sharedConventions > 0, 'No v54b convention became shared.');
    assert(state.inspectorStats.lineageLexiconView && state.inspectorStats.sharedConventionView && state.inspectorText.length > 0, 'v54 inspector did not expose grounded conventions.');
    assert(state.diagnostics?.ok === true, `Evolution diagnostics failed: ${(state.diagnostics?.failures || []).join(' | ')}`);
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'proto-language-v54.json'), JSON.stringify({ setup, learned, listener, copied, state, pageErrors }, null, 2));
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
