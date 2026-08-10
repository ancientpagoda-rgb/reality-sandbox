const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_COMPOSITIONAL_LANGUAGE_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'compositional-language-v55-smoke');
const V55_ONLY_DISTANCE = 141;
const LESSON_TICKS = 15; // exactly one 0.9 s v55 update
const REPETITIONS = 3;
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

    const setup = await page.evaluate(({ distance }) => {
      const planet = window.realitySandboxPlanet;
      const c = planet.world.ecs.components;
      const donor = window.realitySandboxOriginMotileLifeV47.getMotiles().find(x => x.position) || null;
      if (!donor) return { ok:false, reason:'no motile teacher available' };
      for (const id of [...c.motile.keys()]) if (id !== donor.id) planet.world.ecs.destroyEntity(id);
      for (const [, res] of c.resource.entries()) res.amount = 0;
      for (const [, det] of c.detritus.entries()) det.amount = 0;

      const teacher = c.motile.get(donor.id);
      const base = { x:planet.world.width * 0.34, y:planet.world.height * 0.48 };
      const foodTarget = { x:(base.x + 150) % planet.world.width, y:Math.max(24, Math.min(planet.world.height - 24, base.y + 44)) };
      const dangerTarget = { x:(base.x - 145 + planet.world.width) % planet.world.width, y:Math.max(24, Math.min(planet.world.height - 24, base.y - 42)) };
      Object.assign(teacher.genome, { brainSpeed:1, sense:0.45, sociality:0.45, motility:0, heterotrophy:1, aggression:0.1 });
      teacher.energy = 0.82;
      teacher.age = 10;
      teacher.state = 'awake';
      teacher.bioV50 = { mode:'explore', drives:{ explore:1 }, hunger:0.7, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null };
      teacher.bioV51 = null;
      teacher.bioV52 = { learningRate:0.74, retention:0.76, memories:{ food:null, danger:null, hunt:null }, recalledAction:null, recalledMemory:null, lastEnergy:0.82, formedAtStep:0, lastSocialReceivedAtStep:null };
      teacher.bioV53 = { openness:0.74, conformity:0.60, practices:{ 'food-route':{ x:foodTarget.x, y:foodTarget.y, targetId:null, strength:1, modelId:teacher.lineageId, learnedAtStep:0, updatedAtStep:0 }, 'danger-avoidance':null, 'pack-hunt':null }, appliedPractice:'food-route', learnedFrom:null, lastEnergy:0.82, culturalAge:5 };
      teacher.bioV54 = establishedV54(teacher.id, true);
      teacher.bioV55 = null;
      c.position.set(donor.id, base);
      c.velocity.set(donor.id, { vx:0, vy:0 });

      const learnerId = planet.world.ecs.createEntity();
      c.position.set(learnerId, { x:(base.x + distance) % planet.world.width, y:base.y });
      c.velocity.set(learnerId, { vx:0, vy:0 });
      c.motile.set(learnerId, {
        lineageId:teacher.lineageId,
        generation:(teacher.generation || 0) + 1,
        plantAncestorId:teacher.plantAncestorId,
        energy:0.82,
        age:6,
        state:'awake',
        sleepDebt:0.1,
        decisionCooldown:0,
        neurotoxinLoad:0,
        genome:{ ...teacher.genome, brainSpeed:1, sense:0.45, sociality:0.45, motility:0 },
        bioV50:{ mode:'flock', drives:{ flock:1 }, hunger:0.7, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null },
        bioV51:null,
        bioV52:{ learningRate:0.74, retention:0.76, memories:{ food:null, danger:null, hunt:null }, recalledAction:null, recalledMemory:null, lastEnergy:0.82, formedAtStep:0, lastSocialReceivedAtStep:null },
        bioV53:{ openness:0.74, conformity:0.60, practices:{ 'food-route':null, 'danger-avoidance':null, 'pack-hunt':null }, appliedPractice:null, learnedFrom:null, lastEnergy:0.82, culturalAge:0 },
        bioV54:establishedV54(learnerId, true),
        bioV55:null,
      });

      const naiveId = planet.world.ecs.createEntity();
      c.position.set(naiveId, { x:(base.x - distance + planet.world.width) % planet.world.width, y:base.y });
      c.velocity.set(naiveId, { vx:0, vy:0 });
      c.motile.set(naiveId, {
        lineageId:teacher.lineageId,
        generation:(teacher.generation || 0) + 1,
        plantAncestorId:teacher.plantAncestorId,
        energy:0.82,
        age:6,
        state:'awake',
        sleepDebt:0.1,
        decisionCooldown:0,
        neurotoxinLoad:0,
        genome:{ ...teacher.genome, brainSpeed:1, sense:0.45, sociality:0.45, motility:0 },
        bioV50:{ mode:'flock', drives:{ flock:1 }, hunger:0.7, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null },
        bioV51:null,
        bioV52:{ learningRate:0.74, retention:0.76, memories:{ food:null, danger:null, hunt:null }, recalledAction:null, recalledMemory:null, lastEnergy:0.82, formedAtStep:0, lastSocialReceivedAtStep:null },
        bioV53:{ openness:0.74, conformity:0.60, practices:{ 'food-route':null, 'danger-avoidance':null, 'pack-hunt':null }, appliedPractice:null, learnedFrom:null, lastEnergy:0.82, culturalAge:0 },
        bioV54:null,
        bioV55:null,
      });

      function establishedV54(sourceId, includeDanger) {
        const lexicon = {
          ka:{ meaning:'food-route', confidence:1, learnedFrom:sourceId, updatedAtStep:0 },
        };
        const production = { 'food-route':'ka' };
        if (includeDanger) {
          lexicon.ti = { meaning:'danger-avoidance', confidence:1, learnedFrom:sourceId, updatedAtStep:0 };
          production['danger-avoidance'] = 'ti';
        }
        return {
          vocality:0.66,
          receptivity:0.73,
          lexicon,
          production,
          inventionCounter:0,
          lastEmission:null,
          lastHeard:null,
          interpretedMeaning:null,
          appliedLanguageAction:null,
        };
      }

      return { ok:true, teacherId:donor.id, learnerId, naiveId, lineageId:teacher.lineageId, base, foodTarget, dangerTarget };
    }, { distance:V55_ONLY_DISTANCE });
    assert(setup.ok, `v55c setup failed: ${setup.reason || 'unknown'}`);

    // At these traits v53≈136.8, v54≈138.3, v55≈143.9. Every lesson occurs at 141:
    // old culture and holophrase channels are out of range; only the new compositional phrase can arrive.
    for (let round = 0; round < REPETITIONS; round++) {
      await resetGeometry(page, setup, V55_ONLY_DISTANCE);
      await page.evaluate(ticks => window.realitySandboxDebug.advance(ticks), LESSON_TICKS);
    }

    const foodLesson = await page.evaluate(({ teacherId, learnerId, naiveId }) => ({
      teacher54:window.realitySandboxProtoLanguageV54.getLanguage(teacherId),
      learner54:window.realitySandboxProtoLanguageV54.getLanguage(learnerId),
      learner55:window.realitySandboxCompositionalLanguageV55.getComposition(learnerId),
      naive55:window.realitySandboxCompositionalLanguageV55.getComposition(naiveId),
      learnerCulture:window.realitySandboxProtoCultureV53.getCulture(learnerId),
    }), setup);

    const foodToken = tokenForPrimitive(foodLesson.learner55, 'food');
    const thereToken = tokenForPrimitive(foodLesson.learner55, 'there');
    assert(foodToken === 'ka', 'Learner did not reanalyze its already-grounded v54 food holophrase as the food root.');
    assert(thereToken && thereToken !== 'ka', 'Learner did not acquire an independent there modifier.');
    assert((foodLesson.learner55?.lexicon?.[thereToken]?.confidence || 0) >= 0.38, 'Repeated v55 exposure did not raise there to production confidence.');
    assert(foodLesson.learner55?.syntaxOrder, 'Learner did not infer word order from the known-root position.');
    assert(!foodLesson.learner55?.lastPhrase, 'Context-free learner emitted a v55 phrase instead of only listening.');
    assert(!foodLesson.learner54?.lastHeard, 'Learner received a v54 holophrase despite being beyond v54 range.');
    assert(Object.keys(foodLesson.naive55?.lexicon || {}).length === 0, 'Listener without a known v54 root learned v55 meaning anyway.');
    assert(!foodLesson.learnerCulture?.practices?.['food-route'], 'v53 culture crossed the v55-only gap.');

    await page.evaluate(({ teacherId, learnerId, dangerTarget }) => {
      const c = window.realitySandboxPlanet.world.ecs.components;
      const teacher = c.motile.get(teacherId);
      const learner = c.motile.get(learnerId);
      teacher.bioV53.practices['food-route'] = null;
      teacher.bioV53.practices['danger-avoidance'] = { x:dangerTarget.x, y:dangerTarget.y, targetId:null, strength:1, modelId:teacherId, learnedAtStep:0, updatedAtStep:0 };
      teacher.bioV53.appliedPractice = 'danger-avoidance';
      teacher.bioV50 = { ...(teacher.bioV50 || {}), mode:'explore', drives:{ explore:1 }, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null };
      learner.bioV50 = { ...(learner.bioV50 || {}), mode:'flock', drives:{ flock:1 }, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null };
      learner.bioV52.memories = { food:null, danger:null, hunt:null };
      learner.bioV52.recalledAction = null;
      learner.bioV52.recalledMemory = null;
    }, setup);

    for (let round = 0; round < REPETITIONS; round++) {
      await resetGeometry(page, setup, V55_ONLY_DISTANCE);
      await page.evaluate(ticks => window.realitySandboxDebug.advance(ticks), LESSON_TICKS);
    }

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
    assert(dangerToken === 'ti' && avoidToken, 'Learner did not reanalyze the known danger holophrase and acquire avoid.');
    assert((generalized.state?.lexicon?.[avoidToken]?.confidence || 0) >= 0.38, 'Repeated danger phrase exposure did not raise avoid to production confidence.');
    assert(generalized.composed?.novel === true, 'food+avoid was not recognized as a never-heard combination.');
    assert(generalized.decoded?.referent === 'food' && generalized.decoded?.modifier === 'avoid', 'Novel food+avoid composition failed to decode.');
    assert(generalized.decoded?.novel === true, 'Novel composition was incorrectly treated as a memorized whole phrase.');
    assert(generalized.reversed === null, 'Reversed token order decoded despite learned syntax.');

    const reproduction = await page.evaluate(({ teacherId, learnerId, naiveId, foodTarget, distance }) => {
      const planet = window.realitySandboxPlanet;
      const c = planet.world.ecs.components;
      planet.world.ecs.destroyEntity(teacherId);
      planet.world.ecs.destroyEntity(naiveId);
      const learner = c.motile.get(learnerId);
      const lp = c.position.get(learnerId);
      learner.bioV53.practices = { 'food-route':{ x:foodTarget.x, y:foodTarget.y, targetId:null, strength:1, modelId:learnerId, learnedAtStep:0, updatedAtStep:0 }, 'danger-avoidance':null, 'pack-hunt':null };
      learner.bioV53.appliedPractice = 'food-route';
      learner.bioV50 = { ...(learner.bioV50 || {}), mode:'explore', drives:{ explore:1 }, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null };
      learner.bioV52.memories = { food:null, danger:null, hunt:null };
      learner.bioV52.recalledAction = null;
      learner.bioV52.recalledMemory = null;
      c.velocity.set(learnerId, { vx:0, vy:0 });

      const listenerId = planet.world.ecs.createEntity();
      c.position.set(listenerId, { x:(lp.x + distance) % planet.world.width, y:lp.y });
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
        genome:{ ...learner.genome, brainSpeed:1, sense:0.45, sociality:0.45, motility:0 },
        bioV50:{ mode:'flock', drives:{ flock:1 }, hunger:0.7, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null },
        bioV51:null,
        bioV52:{ learningRate:0.74, retention:0.76, memories:{ food:null, danger:null, hunt:null }, recalledAction:null, recalledMemory:null, lastEnergy:0.82, formedAtStep:0, lastSocialReceivedAtStep:null },
        bioV53:{ openness:0.74, conformity:0.60, practices:{ 'food-route':null, 'danger-avoidance':null, 'pack-hunt':null }, appliedPractice:null, learnedFrom:null, lastEnergy:0.82, culturalAge:0 },
        bioV54:{
          vocality:0.66,
          receptivity:0.73,
          lexicon:{ ka:{ meaning:'food-route', confidence:1, learnedFrom:listenerId, updatedAtStep:0 } },
          production:{ 'food-route':'ka' },
          inventionCounter:0,
          lastEmission:null,
          lastHeard:null,
          interpretedMeaning:null,
          appliedLanguageAction:null,
        },
        bioV55:null,
      });
      return { listenerId, learnerStart:{ x:lp.x, y:lp.y } };
    }, { ...setup, distance:V55_ONLY_DISTANCE });

    for (let round = 0; round < REPETITIONS; round++) {
      await page.evaluate(({ learnerId, listenerId, learnerStart, distance }) => {
        const c = window.realitySandboxPlanet.world.ecs.components;
        const width = window.realitySandboxPlanet.world.width;
        c.position.set(learnerId, { ...learnerStart });
        c.position.set(listenerId, { x:(learnerStart.x + distance) % width, y:learnerStart.y });
        c.velocity.set(learnerId, { vx:0, vy:0 });
        c.velocity.set(listenerId, { vx:0, vy:0 });
      }, { ...setup, ...reproduction, distance:V55_ONLY_DISTANCE });
      await page.evaluate(ticks => window.realitySandboxDebug.advance(ticks), LESSON_TICKS);
    }

    const copied = await page.evaluate(({ learnerId, listenerId }) => ({
      learner55:window.realitySandboxCompositionalLanguageV55.getComposition(learnerId),
      listener54:window.realitySandboxProtoLanguageV54.getLanguage(listenerId),
      listener55:window.realitySandboxCompositionalLanguageV55.getComposition(listenerId),
      listenerCulture:window.realitySandboxProtoCultureV53.getCulture(listenerId),
    }), { ...setup, ...reproduction });

    assert(tokenForPrimitive(copied.listener55, 'food') === foodToken, 'Later listener did not retain the known v54 root as the v55 food primitive.');
    assert(tokenForPrimitive(copied.listener55, 'there') === thereToken, 'Later listener did not learn the reproduced there convention.');
    assert(copied.listener55?.syntaxOrder === copied.learner55?.syntaxOrder, 'Later listener did not learn the lineage word-order convention.');
    assert(!copied.listener55?.lastPhrase, 'Context-free later listener emitted before it had anything to say.');
    assert(!copied.listener54?.lastHeard, 'Later listener received v54 despite remaining beyond v54 range.');
    assert(!copied.listenerCulture?.practices?.['food-route'], 'Later listener copied v53 culture across the v55-only gap.');

    const preActionV54Step = copied.listener54?.lastHeard?.step ?? null;
    await page.evaluate(({ learnerId, listenerId, learnerStart, foodTarget, distance }) => {
      const planet = window.realitySandboxPlanet;
      const c = planet.world.ecs.components;
      const learner = c.motile.get(learnerId);
      const listener = c.motile.get(listenerId);
      c.position.set(learnerId, { ...learnerStart });
      c.position.set(listenerId, { x:(learnerStart.x + distance) % planet.world.width, y:learnerStart.y });
      c.velocity.set(learnerId, { vx:0, vy:0 });
      c.velocity.set(listenerId, { vx:0, vy:0 });

      listener.bioV52.memories = { food:null, danger:null, hunt:null };
      listener.bioV52.recalledAction = null;
      listener.bioV52.recalledMemory = null;
      listener.bioV53.practices = { 'food-route':{ x:foodTarget.x, y:foodTarget.y, targetId:null, strength:0.20, modelId:listenerId, learnedAtStep:0, updatedAtStep:0 }, 'danger-avoidance':null, 'pack-hunt':null };
      listener.bioV53.appliedPractice = null;
      listener.bioV50 = { ...(listener.bioV50 || {}), mode:'flock', drives:{ flock:1 }, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null };

      learner.bioV53.practices['food-route'].strength = 1;
      learner.bioV53.appliedPractice = 'food-route';
      learner.bioV50 = { ...(learner.bioV50 || {}), mode:'explore', drives:{ explore:1 }, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null };
    }, { ...setup, ...reproduction, distance:V55_ONLY_DISTANCE });

    await page.evaluate(ticks => window.realitySandboxDebug.advance(ticks), LESSON_TICKS);

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

    assert(state.stats.version === 'v55c-known-holophrase-reanalysis', 'v55c holophrase-reanalysis runtime is not active.');
    assert(state.stats.holophraseReanalysis && state.stats.receiverKnownHolophraseAnchors && state.stats.reanalysisWithoutCurrentContext && state.stats.noSpeakerSemanticMetadata, 'v55c reanalysis contract is incomplete.');
    assert(state.stats.independentPrimitiveMeanings && state.stats.compositionalGeneralization && state.stats.learnedWordOrder && state.stats.wordOrderConstrainsDecoding, 'v55c compositional semantics are incomplete.');
    assert(state.stats.anchoredPhraseHearings > 0 && state.stats.unanchoredPhraseHearings > 0 && state.stats.holophraseReanalyses > 0, 'v55c did not exercise both anchored and unanchored phrase hearings.');
    assert(state.stats.physicallyLocalTransmission && state.stats.kinBiasedTransmission && state.stats.spatialHashing, 'v55c locality contract failed.');
    assert(state.stats.culturallyBlankCompositionalLexiconAtBirth && state.stats.boundedPrimitiveLexicon && state.stats.constantPairMemory, 'v55c bounded cultural-memory contract failed.');
    assert(state.stats.maxPairSpace === 9 && state.stats.primitiveInventory.length === 6, 'v55c primitive/pair space is invalid.');
    assert(state.stats.phraseEmissions > 0 && state.stats.phraseHearings > 0 && state.stats.successfulCompositions > 0, 'v55c recorded no compositional communication cycle.');
    assert(state.v54?.lastHeard?.step === preActionV54Step, 'Final action phase received a v54 holophrase despite being outside v54 range.');
    assert(state.listener?.appliedComposition?.referent === 'food' && state.listener?.appliedComposition?.modifier === 'there', 'A learned v55c phrase did not guide behavior across the v55-only gap.');
    assert(state.stats.sharedPrimitiveConventions > 0 && state.stats.sharedSyntaxConventions > 0, 'No v55c primitive/syntax convention became shared.');
    assert(state.inspectorStats.lineagePrimitiveView && state.inspectorStats.learnedSyntaxView && state.inspectorStats.novelCombinationView && state.inspectorText.length > 0, 'v55 inspector did not expose compositional state.');
    assert(state.diagnostics?.ok === true, `Evolution diagnostics failed: ${(state.diagnostics?.failures || []).join(' | ')}`);
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'compositional-language-v55.json'), JSON.stringify({ setup, foodLesson, generalized, reproduction, copied, preActionV54Step, state, pageErrors }, null, 2));
    await page.screenshot({ path:path.join(artifactDir, 'compositional-language-v55.png'), fullPage:true });
  } finally {
    await browser.close();
  }

  async function resetGeometry(page, setup, distance) {
    await page.evaluate(({ teacherId, learnerId, naiveId, base, distance }) => {
      const c = window.realitySandboxPlanet.world.ecs.components;
      const width = window.realitySandboxPlanet.world.width;
      c.position.set(teacherId, { ...base });
      c.position.set(learnerId, { x:(base.x + distance) % width, y:base.y });
      c.position.set(naiveId, { x:(base.x - distance + width) % width, y:base.y });
      c.velocity.set(teacherId, { vx:0, vy:0 });
      c.velocity.set(learnerId, { vx:0, vy:0 });
      c.velocity.set(naiveId, { vx:0, vy:0 });
    }, { ...setup, distance });
  }

  function tokenForPrimitive(state, primitive) {
    return Object.entries(state?.lexicon || {}).find(([, entry]) => entry.primitive === primitive && entry.confidence >= 0.34)?.[0] || null;
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }
})().catch(error => {
  fs.writeFileSync(path.join(artifactDir, 'fatal-error.txt'), `${error.stack || error.message}\n`);
  console.error(error);
  process.exitCode = 1;
});
