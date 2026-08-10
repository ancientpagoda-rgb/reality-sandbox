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
      const base = { x:planet.world.width * 0.30, y:planet.world.height * 0.48 };
      const foodTarget = { x:(base.x + 120) % planet.world.width, y:Math.max(20, Math.min(planet.world.height - 20, base.y + 35)) };
      const dangerTarget = { x:(base.x - 110 + planet.world.width) % planet.world.width, y:Math.max(20, Math.min(planet.world.height - 20, base.y - 30)) };
      Object.assign(teacher.genome, { brainSpeed:1, sense:1, sociality:1, motility:0, heterotrophy:1, aggression:0.1 });
      teacher.energy = 1.1;
      teacher.age = 10;
      teacher.state = 'awake';
      teacher.bioV50 = { mode:'explore', drives:{ explore:1 }, hunger:0, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null };
      teacher.bioV51 = null;
      teacher.bioV52 = { learningRate:1, retention:0.94, memories:{ food:null, danger:null, hunt:null }, recalledAction:null, recalledMemory:null, lastEnergy:1.1, formedAtStep:0, lastSocialReceivedAtStep:null };
      teacher.bioV53 = { openness:1, conformity:1, practices:{ 'food-route':{ x:foodTarget.x, y:foodTarget.y, targetId:null, strength:1, modelId:teacher.lineageId, learnedAtStep:0, updatedAtStep:0 }, 'danger-avoidance':null, 'pack-hunt':null }, appliedPractice:'food-route', learnedFrom:null, lastEnergy:1.1, culturalAge:5 };
      teacher.bioV54 = null;
      teacher.bioV55 = null;
      c.position.set(donor.id, base);
      c.velocity.set(donor.id, { vx:0, vy:0 });

      const learnerId = planet.world.ecs.createEntity();
      c.position.set(learnerId, { x:(base.x + 263) % planet.world.width, y:base.y });
      c.velocity.set(learnerId, { vx:0, vy:0 });
      c.motile.set(learnerId, {
        lineageId:teacher.lineageId,
        generation:(teacher.generation || 0) + 1,
        plantAncestorId:teacher.plantAncestorId,
        energy:1.1,
        age:6,
        state:'awake',
        sleepDebt:0.1,
        decisionCooldown:0,
        neurotoxinLoad:0,
        genome:{ ...teacher.genome, brainSpeed:1, sense:1, sociality:1, motility:0 },
        bioV50:{ mode:'explore', drives:{ explore:1 }, hunger:0, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null },
        bioV51:null,
        bioV52:{ learningRate:1, retention:0.94, memories:{ food:null, danger:null, hunt:null }, recalledAction:null, recalledMemory:null, lastEnergy:1.1, formedAtStep:0, lastSocialReceivedAtStep:null },
        bioV53:{ openness:1, conformity:1, practices:{ 'food-route':null, 'danger-avoidance':null, 'pack-hunt':null }, appliedPractice:null, learnedFrom:null, lastEnergy:1.1, culturalAge:0 },
        bioV54:null,
        bioV55:null,
      });
      return { ok:true, teacherId:donor.id, learnerId, lineageId:teacher.lineageId, base, foodTarget, dangerTarget };
    });
    assert(setup.ok, `v55 deterministic setup failed: ${setup.reason || 'unknown'}`);

    // 30 fixed ticks = 1.8 simulated seconds, enough for two 0.9 s v55 updates.
    await page.evaluate(() => window.realitySandboxDebug.advance(30));

    const firstLesson = await page.evaluate(({ teacherId, learnerId }) => ({
      teacher:window.realitySandboxCompositionalLanguageV55.getComposition(teacherId),
      learner:window.realitySandboxCompositionalLanguageV55.getComposition(learnerId),
    }), setup);
    const foodToken = tokenForPrimitive(firstLesson.learner, 'food');
    const thereToken = tokenForPrimitive(firstLesson.learner, 'there');
    assert(foodToken && thereToken && foodToken !== thereToken, 'Learner did not acquire independent food/there primitive symbols.');
    assert(firstLesson.learner?.syntaxOrder, 'Learner did not acquire a word-order convention.');

    await page.evaluate(({ teacherId, dangerTarget }) => {
      const c = window.realitySandboxPlanet.world.ecs.components;
      const teacher = c.motile.get(teacherId);
      teacher.bioV50 = { ...(teacher.bioV50 || {}), mode:'explore', drives:{ explore:1 }, hunger:0, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null };
      teacher.bioV52.recalledAction = null;
      teacher.bioV52.recalledMemory = null;
      teacher.bioV53.practices['food-route'] = null;
      teacher.bioV53.practices['danger-avoidance'] = { x:dangerTarget.x, y:dangerTarget.y, targetId:null, strength:1, modelId:teacherId, learnedAtStep:0, updatedAtStep:0 };
      teacher.bioV53.appliedPractice = 'danger-avoidance';
      c.velocity.set(teacherId, { vx:0, vy:0 });
    }, setup);

    await page.evaluate(() => window.realitySandboxDebug.advance(30));

    const generalized = await page.evaluate(({ learnerId }) => {
      const api = window.realitySandboxCompositionalLanguageV55;
      const state = api.getComposition(learnerId);
      const foodToken = Object.entries(state.lexicon).find(([, entry]) => entry.primitive === 'food' && entry.confidence >= 0.34)?.[0] || null;
      const avoidToken = Object.entries(state.lexicon).find(([, entry]) => entry.primitive === 'avoid' && entry.confidence >= 0.34)?.[0] || null;
      const composed = api.composeSequence(learnerId, 'food', 'avoid');
      const decoded = composed ? api.decodeSequence(learnerId, composed.tokens) : null;
      return { state, foodToken, avoidToken, composed, decoded };
    }, setup);

    assert(generalized.foodToken && generalized.avoidToken, 'Learner did not acquire primitives from two distinct grounded contexts.');
    assert(generalized.composed?.novel === true, 'v55 did not recognize food+avoid as a never-heard combination.');
    assert(generalized.decoded?.referent === 'food' && generalized.decoded?.modifier === 'avoid', 'v55 failed compositional decoding of a novel primitive combination.');
    assert(generalized.decoded?.novel === true, 'Novel composition was incorrectly treated as a memorized whole phrase.');

    const reproduction = await page.evaluate(({ teacherId, learnerId, foodTarget }) => {
      const planet = window.realitySandboxPlanet;
      const c = planet.world.ecs.components;
      planet.world.ecs.destroyEntity(teacherId);
      const learner = c.motile.get(learnerId);
      const lp = c.position.get(learnerId);
      learner.bioV50 = { ...(learner.bioV50 || {}), mode:'explore', drives:{ explore:1 }, hunger:0, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null };
      learner.bioV52.recalledAction = null;
      learner.bioV52.recalledMemory = null;
      learner.bioV53.practices['danger-avoidance'] = null;
      learner.bioV53.practices['food-route'] = { x:foodTarget.x, y:foodTarget.y, targetId:null, strength:1, modelId:learnerId, learnedAtStep:0, updatedAtStep:0 };
      learner.bioV53.appliedPractice = 'food-route';
      c.velocity.set(learnerId, { vx:0, vy:0 });

      const listenerId = planet.world.ecs.createEntity();
      c.position.set(listenerId, { x:(lp.x + 263) % planet.world.width, y:lp.y });
      c.velocity.set(listenerId, { vx:0, vy:0 });
      c.motile.set(listenerId, {
        lineageId:learner.lineageId,
        generation:(learner.generation || 0) + 1,
        plantAncestorId:learner.plantAncestorId,
        energy:1.1,
        age:5,
        state:'awake',
        sleepDebt:0.1,
        decisionCooldown:0,
        neurotoxinLoad:0,
        genome:{ ...learner.genome, brainSpeed:1, sense:1, sociality:1, motility:0 },
        bioV50:{ mode:'explore', drives:{ explore:1 }, hunger:0, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null },
        bioV51:null,
        bioV52:{ learningRate:1, retention:0.94, memories:{ food:{ x:foodTarget.x, y:foodTarget.y, strength:0.9, targetId:null, source:'direct', updatedAtStep:0 }, danger:null, hunt:null }, recalledAction:null, recalledMemory:null, lastEnergy:1.1, formedAtStep:0, lastSocialReceivedAtStep:null },
        bioV53:{ openness:1, conformity:1, practices:{ 'food-route':null, 'danger-avoidance':null, 'pack-hunt':null }, appliedPractice:null, learnedFrom:null, lastEnergy:1.1, culturalAge:0 },
        bioV54:null,
        bioV55:null,
      });
      return { listenerId };
    }, setup);

    await page.evaluate(() => window.realitySandboxDebug.advance(30));

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
        learner:composition.getComposition(learnerId),
        listener:composition.getComposition(listenerId),
        inspectorStats:compositionInspector.getStats(),
        inspectorText:root?.querySelector('.composition-v55-body')?.textContent || '',
        diagnostics:window.realitySandboxEvolutionDiagnosticsV48d?.invariants?.() || null,
        evolutionBuild:document.documentElement.dataset.evolutionBuild,
      };
    }, { ...setup, ...reproduction });

    const reproducedFood = tokenForPrimitive(state.learner, 'food');
    const reproducedThere = tokenForPrimitive(state.learner, 'there');
    const listenerFood = tokenForPrimitive(state.listener, 'food');
    const listenerThere = tokenForPrimitive(state.listener, 'there');

    assert(state.stats.installed === true, 'v55 compositional language is not installed.');
    assert(state.stats.independentPrimitiveMeanings && state.stats.compositionalGeneralization && state.stats.learnedWordOrder, 'v55 compositional semantics are incomplete.');
    assert(state.stats.syntaxLearnedFromObservedSequence && state.stats.nonGeneticCompositionalTransmission, 'v55 syntax/phrase transmission is not culturally learned.');
    assert(state.stats.physicallyLocalTransmission && state.stats.kinBiasedTransmission && state.stats.spatialHashing, 'v55 phrase transmission is not physically local/spatially hashed.');
    assert(state.stats.culturallyBlankCompositionalLexiconAtBirth && state.stats.boundedPrimitiveLexicon && state.stats.constantPairMemory, 'v55 compositional memory is not bounded/culturally blank at birth.');
    assert(state.stats.maxPairSpace === 9 && state.stats.primitiveInventory.length === 6, 'v55 primitive/pair space is invalid.');
    assert(state.stats.phraseEmissions > 0 && state.stats.phraseHearings > 0 && state.stats.successfulCompositions > 0, 'v55 recorded no compositional communication cycle.');
    assert(reproducedFood === foodToken && reproducedThere === thereToken, 'Learner did not reproduce the learned food+there primitive convention.');
    assert(listenerFood === foodToken && listenerThere === thereToken, 'Later listener did not acquire the reproduced primitive convention.');
    assert(state.listener?.syntaxOrder === state.learner?.syntaxOrder, 'Later listener did not acquire the learned word-order convention.');
    assert(state.stats.compositionalGuidanceEvents > 0 || state.listener?.appliedComposition?.referent === 'food', 'A learned two-symbol composition never affected behavior.');
    assert(state.stats.sharedPrimitiveConventions > 0 && state.stats.sharedSyntaxConventions > 0, 'No primitive/syntax convention became shared.');
    assert(state.inspectorStats.lineagePrimitiveView && state.inspectorStats.learnedSyntaxView && state.inspectorStats.novelCombinationView && state.inspectorText.length > 0, 'v55 inspector did not expose compositional state.');
    assert(state.evolutionBuild === 'evolution-v55-compositional-language', `Unexpected evolution build ${state.evolutionBuild}.`);
    assert(state.diagnostics?.ok === true, `Evolution diagnostics failed: ${(state.diagnostics?.failures || []).join(' | ')}`);
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'compositional-language-v55.json'), JSON.stringify({ setup, firstLesson, generalized, reproduction, state, pageErrors }, null, 2));
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
