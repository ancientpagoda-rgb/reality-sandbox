const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_COMPOSITIONAL_LANGUAGE_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'compositional-language-v55-smoke');
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
      window.realitySandboxProtoLanguageV54?.installed &&
      window.realitySandboxCompositionalLanguageV55?.installed &&
      window.realitySandboxCompositionalLanguageInspectorV55a?.installed
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
      const base = { x:planet.world.width * 0.34, y:planet.world.height * 0.48 };
      const foodTarget = { x:(base.x + 140) % planet.world.width, y:Math.max(24, Math.min(planet.world.height - 24, base.y + 42)) };
      const dangerTarget = { x:(base.x - 135 + planet.world.width) % planet.world.width, y:Math.max(24, Math.min(planet.world.height - 24, base.y - 38)) };
      Object.assign(teacher.genome, { brainSpeed:1, sense:0, sociality:0.1, motility:0, heterotrophy:1, aggression:0.1 });
      teacher.energy = 0.82;
      teacher.age = 10;
      teacher.state = 'awake';
      teacher.bioV50 = { mode:'explore', drives:{ explore:1 }, hunger:0.7, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null };
      teacher.bioV51 = null;
      teacher.bioV52 = { learningRate:0.63, retention:0.72, memories:{ food:null, danger:null, hunt:null }, recalledAction:null, recalledMemory:null, lastEnergy:0.82, formedAtStep:0, lastSocialReceivedAtStep:null };
      teacher.bioV53 = { openness:0.55, conformity:0.29, practices:{ 'food-route':{ x:foodTarget.x, y:foodTarget.y, targetId:null, strength:1, modelId:teacher.lineageId, learnedAtStep:0, updatedAtStep:0 }, 'danger-avoidance':null, 'pack-hunt':null }, appliedPractice:'food-route', learnedFrom:null, lastEnergy:0.82, culturalAge:5 };
      teacher.bioV54 = null;
      teacher.bioV55 = null;
      c.position.set(donor.id, base);
      c.velocity.set(donor.id, { vx:0, vy:0 });

      function addReceiver(x, groundedFood) {
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
          genome:{ ...teacher.genome, brainSpeed:1, sense:0, sociality:0.1, motility:0 },
          bioV50:{ mode:'explore', drives:{ explore:1 }, hunger:0.7, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null },
          bioV51:null,
          bioV52:{ learningRate:0.63, retention:0.72, memories:{ food:groundedFood ? { x:foodTarget.x, y:foodTarget.y, strength:1, targetId:null, source:'direct', updatedAtStep:0 } : null, danger:null, hunt:null }, recalledAction:null, recalledMemory:null, lastEnergy:0.82, formedAtStep:0, lastSocialReceivedAtStep:null },
          bioV53:{ openness:0.55, conformity:0.29, practices:{ 'food-route':null, 'danger-avoidance':null, 'pack-hunt':null }, appliedPractice:null, learnedFrom:null, lastEnergy:0.82, culturalAge:0 },
          bioV54:null,
          bioV55:null,
        });
        return id;
      }

      // brain=1,sense=0,sociality=.1 => v53≈43.4, v54≈49.2, v55≈51.6.
      // At distance 46 receivers hear v54/v55 but cannot copy v53 culture.
      const learnerId = addReceiver((base.x + 46) % planet.world.width, true);
      const naiveId = addReceiver((base.x - 46 + planet.world.width) % planet.world.width, false);
      return { ok:true, teacherId:donor.id, learnerId, naiveId, lineageId:teacher.lineageId, foodTarget, dangerTarget };
    });
    assert(setup.ok, `v55b setup failed: ${setup.reason || 'unknown'}`);

    await page.evaluate(() => window.realitySandboxDebug.advance(90));

    const firstLesson = await page.evaluate(({ teacherId, learnerId, naiveId }) => ({
      teacher54:window.realitySandboxProtoLanguageV54.getLanguage(teacherId),
      learner54:window.realitySandboxProtoLanguageV54.getLanguage(learnerId),
      learner55:window.realitySandboxCompositionalLanguageV55.getComposition(learnerId),
      naive55:window.realitySandboxCompositionalLanguageV55.getComposition(naiveId),
      learnerCulture:window.realitySandboxProtoCultureV53.getCulture(learnerId),
      naiveCulture:window.realitySandboxProtoCultureV53.getCulture(naiveId),
    }), setup);

    const foodRoot = firstLesson.teacher54?.production?.['food-route'];
    const foodToken = tokenForPrimitive(firstLesson.learner55, 'food');
    const thereToken = tokenForPrimitive(firstLesson.learner55, 'there');
    assert(foodRoot && foodToken === foodRoot, 'v55b did not reanalyze the grounded v54 food holophrase as its referent root.');
    assert(thereToken && thereToken !== foodRoot, 'v55b learner did not acquire an independent there modifier.');
    assert(firstLesson.learner55?.syntaxOrder, 'v55b learner did not infer word order from root position.');
    assert(Object.keys(firstLesson.naive55?.lexicon || {}).length === 0, 'Ungrounded listener learned v55 primitive meanings without an independent context/root anchor.');
    assert(!firstLesson.learnerCulture?.practices?.['food-route'] && !firstLesson.naiveCulture?.practices?.['food-route'], 'v53 tradition leaked across the language-only range.');

    await page.evaluate(({ teacherId, learnerId, dangerTarget }) => {
      const c = window.realitySandboxPlanet.world.ecs.components;
      const teacher = c.motile.get(teacherId);
      const learner = c.motile.get(learnerId);
      teacher.bioV53.practices['food-route'] = null;
      teacher.bioV53.practices['danger-avoidance'] = { x:dangerTarget.x, y:dangerTarget.y, targetId:null, strength:1, modelId:teacherId, learnedAtStep:0, updatedAtStep:0 };
      teacher.bioV53.appliedPractice = 'danger-avoidance';
      learner.bioV52.memories = { food:null, danger:{ x:dangerTarget.x, y:dangerTarget.y, strength:1, targetId:null, source:'direct', updatedAtStep:0 }, hunt:null };
      learner.bioV52.recalledAction = null;
      learner.bioV52.recalledMemory = null;
      learner.bioV50 = { ...(learner.bioV50 || {}), mode:'explore', drives:{ explore:1 }, hunger:0.7, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null };
      c.velocity.set(teacherId, { vx:0, vy:0 });
      c.velocity.set(learnerId, { vx:0, vy:0 });
    }, setup);

    await page.evaluate(() => window.realitySandboxDebug.advance(90));

    const generalized = await page.evaluate(({ learnerId }) => {
      const api = window.realitySandboxCompositionalLanguageV55;
      const state = api.getComposition(learnerId);
      const composed = api.composeSequence(learnerId, 'food', 'avoid');
      const decoded = composed ? api.decodeSequence(learnerId, composed.tokens) : null;
      const reversed = composed ? api.decodeSequence(learnerId, [...composed.tokens].reverse()) : null;
      return { state, composed, decoded, reversed };
    }, setup);

    const dangerToken = tokenForPrimitive(generalized.state, 'danger');
    const avoidToken = tokenForPrimitive(generalized.state, 'avoid');
    assert(dangerToken && avoidToken, 'Learner did not acquire grounded danger/avoid primitives.');
    assert(generalized.composed?.novel === true, 'food+avoid was not recognized as a never-heard combination.');
    assert(generalized.decoded?.referent === 'food' && generalized.decoded?.modifier === 'avoid', 'Novel food+avoid composition failed to decode.');
    assert(generalized.decoded?.novel === true, 'Novel composition was incorrectly treated as a memorized whole phrase.');
    assert(generalized.reversed === null, 'Reversed token order decoded despite learned syntax.');

    const reproduction = await page.evaluate(({ teacherId, learnerId, naiveId, foodTarget }) => {
      const planet = window.realitySandboxPlanet;
      const c = planet.world.ecs.components;
      planet.world.ecs.destroyEntity(teacherId);
      planet.world.ecs.destroyEntity(naiveId);
      const learner = c.motile.get(learnerId);
      const lp = c.position.get(learnerId);
      learner.bioV52.memories = { food:{ x:foodTarget.x, y:foodTarget.y, strength:1, targetId:null, source:'direct', updatedAtStep:0 }, danger:null, hunt:null };
      learner.bioV52.recalledAction = null;
      learner.bioV52.recalledMemory = null;
      learner.bioV53.practices = { 'food-route':{ x:foodTarget.x, y:foodTarget.y, targetId:null, strength:1, modelId:learnerId, learnedAtStep:0, updatedAtStep:0 }, 'danger-avoidance':null, 'pack-hunt':null };
      learner.bioV53.appliedPractice = 'food-route';
      c.velocity.set(learnerId, { vx:0, vy:0 });

      const listenerId = planet.world.ecs.createEntity();
      c.position.set(listenerId, { x:(lp.x + 46) % planet.world.width, y:lp.y });
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
        genome:{ ...learner.genome, brainSpeed:1, sense:0, sociality:0.1, motility:0 },
        bioV50:{ mode:'explore', drives:{ explore:1 }, hunger:0.7, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null },
        bioV51:null,
        bioV52:{ learningRate:0.63, retention:0.72, memories:{ food:{ x:foodTarget.x, y:foodTarget.y, strength:1, targetId:null, source:'direct', updatedAtStep:0 }, danger:null, hunt:null }, recalledAction:null, recalledMemory:null, lastEnergy:0.82, formedAtStep:0, lastSocialReceivedAtStep:null },
        bioV53:{ openness:0.55, conformity:0.29, practices:{ 'food-route':null, 'danger-avoidance':null, 'pack-hunt':null }, appliedPractice:null, learnedFrom:null, lastEnergy:0.82, culturalAge:0 },
        bioV54:null,
        bioV55:null,
      });
      return { listenerId };
    }, setup);

    await page.evaluate(() => window.realitySandboxDebug.advance(90));

    const learnedAgain = await page.evaluate(({ learnerId, listenerId }) => ({
      learner54:window.realitySandboxProtoLanguageV54.getLanguage(learnerId),
      learner55:window.realitySandboxCompositionalLanguageV55.getComposition(learnerId),
      listener54:window.realitySandboxProtoLanguageV54.getLanguage(listenerId),
      listener55:window.realitySandboxCompositionalLanguageV55.getComposition(listenerId),
    }), { ...setup, ...reproduction });

    const listenerFood = tokenForPrimitive(learnedAgain.listener55, 'food');
    const listenerThere = tokenForPrimitive(learnedAgain.listener55, 'there');
    assert(learnedAgain.learner54?.production?.['food-route'] === foodRoot, 'Learner did not reproduce the v54 root convention.');
    assert(tokenForPrimitive(learnedAgain.learner55, 'food') === foodToken && tokenForPrimitive(learnedAgain.learner55, 'there') === thereToken, 'Learner did not reproduce the learned v55 primitive convention.');
    assert(listenerFood === foodToken && listenerThere === thereToken, 'Later grounded listener did not acquire the reproduced v55 convention.');
    assert(learnedAgain.listener55?.syntaxOrder === learnedAgain.learner55?.syntaxOrder, 'Later listener did not infer the same learned word order.');

    const preActionV54Step = learnedAgain.listener54?.lastHeard?.step ?? null;
    await page.evaluate(({ learnerId, listenerId, foodTarget }) => {
      const planet = window.realitySandboxPlanet;
      const c = planet.world.ecs.components;
      const learner = c.motile.get(learnerId);
      const listener = c.motile.get(listenerId);
      const lp = c.position.get(learnerId);
      // 50 units is outside v54 (~49.2) and v53 (~43.4), but inside v55 (~51.6).
      c.position.set(listenerId, { x:(lp.x + 50) % planet.world.width, y:lp.y });
      listener.bioV52.memories = { food:null, danger:null, hunt:null };
      listener.bioV52.recalledAction = null;
      listener.bioV52.recalledMemory = null;
      listener.bioV53.practices = { 'food-route':{ x:foodTarget.x, y:foodTarget.y, targetId:null, strength:0.20, modelId:listenerId, learnedAtStep:0, updatedAtStep:0 }, 'danger-avoidance':null, 'pack-hunt':null };
      listener.bioV53.appliedPractice = null;
      listener.bioV50 = { ...(listener.bioV50 || {}), mode:'flock', drives:{ flock:1 }, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null };
      learner.bioV53.practices['food-route'].strength = 1;
      learner.bioV53.appliedPractice = 'food-route';
      c.velocity.set(listenerId, { vx:0, vy:0 });
    }, { ...setup, ...reproduction });

    await page.evaluate(() => window.realitySandboxDebug.advance(60));

    const state = await page.evaluate(({ learnerId, listenerId, lineageId }) => {
      const composition = window.realitySandboxCompositionalLanguageV55;
      const inspector = window.realitySandboxEvolutionInspectorV47b;
      const compositionInspector = window.realitySandboxCompositionalLanguageInspectorV55a;
      inspector.selectLineage(lineageId);
      inspector.open();
      compositionInspector.render();
      const root = document.getElementById('evolutionInspectorV47bHost')?.shadowRoot;
      return {
        stats:composition.getStats(),
        v54:window.realitySandboxProtoLanguageV54.getLanguage(listenerId),
        learner:composition.getComposition(learnerId),
        listener:composition.getComposition(listenerId),
        inspectorStats:compositionInspector.getStats(),
        inspectorText:root?.querySelector('.composition-v55-body')?.textContent || '',
        diagnostics:window.realitySandboxEvolutionDiagnosticsV48d?.invariants?.() || null,
      };
    }, { ...setup, ...reproduction });

    assert(state.stats.version === 'v55b-holophrase-reanalysis', 'Grounded v55b runtime is not active.');
    assert(state.stats.holophraseReanalysis && state.stats.receiverGroundedPrimitiveLearning && state.stats.rootAnchoredSyntaxLearning && state.stats.noSpeakerSemanticMetadata, 'v55b grounding/reanalysis contract is incomplete.');
    assert(state.stats.independentPrimitiveMeanings && state.stats.compositionalGeneralization && state.stats.learnedWordOrder && state.stats.wordOrderConstrainsDecoding, 'v55b compositional semantics are incomplete.');
    assert(state.stats.groundedPhraseHearings > 0 && state.stats.ungroundedPhraseHearings > 0 && state.stats.holophraseReanalyses > 0, 'v55b did not exercise grounded reanalysis and later ungrounded use.');
    assert(state.stats.physicallyLocalTransmission && state.stats.kinBiasedTransmission && state.stats.spatialHashing, 'v55b locality contract failed.');
    assert(state.stats.culturallyBlankCompositionalLexiconAtBirth && state.stats.boundedPrimitiveLexicon && state.stats.constantPairMemory, 'v55b bounded cultural-memory contract failed.');
    assert(state.stats.maxPairSpace === 9 && state.stats.primitiveInventory.length === 6, 'v55b primitive/pair space is invalid.');
    assert(state.stats.phraseEmissions > 0 && state.stats.phraseHearings > 0 && state.stats.successfulCompositions > 0, 'v55b recorded no compositional communication cycle.');
    assert(state.v54?.lastHeard?.step === preActionV54Step, 'Final action phase received a v54 holophrase despite being outside v54 range.');
    assert(state.listener?.appliedComposition?.referent === 'food' && state.listener?.appliedComposition?.modifier === 'there', 'A learned v55 phrase did not guide behavior when v54 was out of range.');
    assert(state.stats.sharedPrimitiveConventions > 0 && state.stats.sharedSyntaxConventions > 0, 'No v55b primitive/syntax convention became shared.');
    assert(state.inspectorStats.lineagePrimitiveView && state.inspectorStats.learnedSyntaxView && state.inspectorStats.novelCombinationView && state.inspectorText.length > 0, 'v55 inspector did not expose grounded compositional state.');
    assert(state.diagnostics?.ok === true, `Evolution diagnostics failed: ${(state.diagnostics?.failures || []).join(' | ')}`);
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'compositional-language-v55.json'), JSON.stringify({ setup, firstLesson, generalized, reproduction, learnedAgain, preActionV54Step, state, pageErrors }, null, 2));
    await page.screenshot({ path:path.join(artifactDir, 'compositional-language-v55.png'), fullPage:true });
  } finally {
    await browser.close();
  }

  function tokenForPrimitive(state, primitive) {
    return Object.entries(state?.lexicon || {}).find(([, entry]) => entry.primitive === primitive && entry.confidence >= 0.34)?.[0] || null;
  }
  function assert(condition, message) { if (!condition) throw new Error(message); }
})().catch(error => {
  fs.writeFileSync(path.join(artifactDir, 'fatal-error.txt'), `${error.stack || error.message}\n`);
  console.error(error);
  process.exitCode = 1;
});
