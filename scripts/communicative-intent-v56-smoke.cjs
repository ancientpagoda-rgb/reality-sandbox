const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_COMMUNICATIVE_INTENT_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'communicative-intent-v56-smoke');
const LESSON_DISTANCE = 226;
const STEP_TICKS = 15; // 15 * 0.06 s = one 0.9 s v56 update.
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
      window.realitySandboxProtoCultureV53?.installed &&
      window.realitySandboxProtoLanguageV54?.installed &&
      window.realitySandboxCompositionalLanguageV55?.installed &&
      window.realitySandboxCommunicativeIntentV56?.installed &&
      window.realitySandboxCommunicativeIntentInspectorV56a?.installed
    ), null, { timeout:120000 });

    await page.evaluate(() => window.realitySandboxDebug.advance(3600));

    const setup = await page.evaluate(({ distance }) => {
      const planet = window.realitySandboxPlanet;
      const c = planet.world.ecs.components;
      const donor = window.realitySandboxOriginMotileLifeV47.getMotiles().find(x => x.position) || null;
      if (!donor) return { ok:false, reason:'no motile speaker available' };

      for (const id of [...c.motile.keys()]) if (id !== donor.id) planet.world.ecs.destroyEntity(id);
      for (const [, res] of c.resource.entries()) res.amount = 0;
      for (const [, det] of c.detritus.entries()) det.amount = 0;

      const teacher = c.motile.get(donor.id);
      const base = { x:planet.world.width * 0.40, y:planet.world.height * 0.56 };
      const target = { x:base.x, y:Math.max(30, base.y - 120) };
      const genome = {
        ...teacher.genome,
        brainSpeed:1,
        sense:0.8,
        sociality:0.8,
        motility:0,
        heterotrophy:1,
        aggression:0.1,
        dormancy:0.4,
        metabolism:0.3,
      };
      const knownV54 = learnedFrom => ({
        vocality:1,
        receptivity:1,
        lexicon:{ ka:{ meaning:'food-route', confidence:0.96, learnedFrom, updatedAtStep:0 } },
        production:{ 'food-route':'ka' },
        inventionCounter:0,
        lastEmission:null,
        lastHeard:null,
        interpretedMeaning:null,
        appliedLanguageAction:null,
      });

      Object.assign(teacher.genome, genome);
      teacher.energy = 0.55;
      teacher.age = 12;
      teacher.state = 'awake';
      teacher.sleepDebt = 0.05;
      teacher.bioV50 = { mode:'explore', drives:{ explore:1 }, hunger:0.45, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null };
      teacher.bioV51 = null;
      teacher.bioV52 = {
        learningRate:0.9,
        retention:0.9,
        memories:{ food:{ x:target.x, y:target.y, strength:1, targetId:null, source:'direct', updatedAtStep:0 }, danger:null, hunt:null },
        recalledAction:'seek-food',
        recalledMemory:{ type:'food', x:target.x, y:target.y, strength:1 },
        lastEnergy:0.55,
        formedAtStep:0,
        lastSocialReceivedAtStep:null,
      };
      teacher.bioV53 = {
        openness:0.9,
        conformity:0.8,
        practices:{
          'food-route':{ x:target.x, y:target.y, targetId:null, strength:1, modelId:donor.id, learnedAtStep:0, updatedAtStep:0 },
          'danger-avoidance':null,
          'pack-hunt':null,
        },
        appliedPractice:'food-route',
        learnedFrom:null,
        lastEnergy:0.55,
        culturalAge:8,
      };
      teacher.bioV54 = knownV54(donor.id);
      teacher.bioV55 = {
        combinatorialCapacity:1,
        syntaxLearning:1,
        lexicon:{
          ka:{ primitive:'food', confidence:0.96, learnedFrom:donor.id, updatedAtStep:0 },
          ra:{ primitive:'there', confidence:0.96, learnedFrom:donor.id, updatedAtStep:0 },
        },
        production:{ food:'ka', there:'ra' },
        syntaxOrder:'referent-modifier',
        syntaxConfidence:0.96,
        inventionCounter:0,
        observedPairMask:0,
        lastPhrase:null,
        lastHeardPhrase:null,
        interpretedComposition:null,
        appliedComposition:null,
      };
      teacher.bioV56 = null;
      c.position.set(donor.id, base);
      c.velocity.set(donor.id, { vx:0, vy:0 });

      const listenerId = planet.world.ecs.createEntity();
      c.position.set(listenerId, { x:(base.x + distance) % planet.world.width, y:base.y });
      c.velocity.set(listenerId, { vx:0, vy:0 });
      c.motile.set(listenerId, {
        lineageId:teacher.lineageId,
        generation:(teacher.generation || 0) + 1,
        plantAncestorId:teacher.plantAncestorId,
        energy:0.95,
        age:7,
        state:'awake',
        sleepDebt:0,
        decisionCooldown:0,
        neurotoxinLoad:0,
        genome:{ ...genome },
        bioV50:{ mode:'rest', drives:{ rest:1 }, hunger:0, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null },
        bioV51:null,
        bioV52:{
          learningRate:0.9,
          retention:0.9,
          memories:{ food:null, danger:null, hunt:null },
          recalledAction:null,
          recalledMemory:null,
          lastEnergy:0.95,
          formedAtStep:0,
          lastSocialReceivedAtStep:null,
        },
        bioV53:{
          openness:0.9,
          conformity:0.8,
          practices:{ 'food-route':null, 'danger-avoidance':null, 'pack-hunt':null },
          appliedPractice:null,
          learnedFrom:null,
          lastEnergy:0.95,
          culturalAge:0,
        },
        bioV54:knownV54(donor.id),
        bioV55:{
          combinatorialCapacity:1,
          syntaxLearning:1,
          lexicon:{
            ka:{ primitive:'food', confidence:0.96, learnedFrom:donor.id, updatedAtStep:0 },
            ra:{ primitive:'there', confidence:0.96, learnedFrom:donor.id, updatedAtStep:0 },
          },
          production:{},
          syntaxOrder:'referent-modifier',
          syntaxConfidence:0.96,
          inventionCounter:0,
          observedPairMask:0,
          lastPhrase:null,
          lastHeardPhrase:null,
          interpretedComposition:null,
          appliedComposition:null,
        },
        bioV56:null,
      });

      return { ok:true, teacherId:donor.id, listenerId, lineageId:teacher.lineageId, target, base, distance };
    }, { distance:LESSON_DISTANCE });
    assert(setup.ok, `v56 setup failed: ${setup.reason || 'unknown'}`);

    // At sense=.8/sociality=.8:
    // v53 ≈215.2, v54 ≈213.2, v55 ≈221.6, v56 =232.
    // A 226-unit separation isolates the new intentional channel.
    await page.evaluate(ticks => window.realitySandboxDebug.advance(ticks), STEP_TICKS);

    const afterAct = await page.evaluate(({ teacherId, listenerId }) => {
      const planet = window.realitySandboxPlanet;
      const c = planet.world.ecs.components;
      const listener = c.motile.get(listenerId);
      return {
        teacher:window.realitySandboxCommunicativeIntentV56.getIntent(teacherId),
        listener:window.realitySandboxCommunicativeIntentV56.getIntent(listenerId),
        listenerVelocity:{ ...c.velocity.get(listenerId) },
        listenerMemory:{ ...listener.bioV52, memories:{ ...listener.bioV52.memories } },
        listenerCulture:window.realitySandboxProtoCultureV53.getCulture(listenerId),
        listenerLanguage:window.realitySandboxProtoLanguageV54.getLanguage(listenerId),
        listenerComposition:window.realitySandboxCompositionalLanguageV55.getComposition(listenerId),
      };
    }, setup);

    const gesture = afterAct.listener?.lastJointAttention?.gesture;
    assert(gesture && Number.isFinite(gesture.x) && Number.isFinite(gesture.y), 'Listener formed no v56 joint-attention gesture.');
    assert(afterAct.listener.lastJointAttention.referent === 'food' && afterAct.listener.lastJointAttention.modifier === 'there', 'Listener decoded the wrong intentional phrase.');
    assert(afterAct.listenerLanguage?.lexicon?.ka?.meaning === 'food-route', 'Knowledgeable listener lost the established v54 root convention.');
    assert(!afterAct.listenerLanguage?.lastHeard, 'Listener received a new v54 holophrase despite remaining outside v54 range.');
    assert(!afterAct.listenerMemory.memories.food, 'Listener unexpectedly had its own food memory.');
    assert(!afterAct.listenerCulture?.practices?.['food-route'], 'Listener unexpectedly acquired the v53 food-route tradition.');
    assert(!afterAct.listenerComposition?.appliedComposition, 'v55 guided the listener despite having no local target; v56 isolation failed.');
    const velocityDot = afterAct.listenerVelocity.vx * gesture.x + afterAct.listenerVelocity.vy * gesture.y;
    assert(velocityDot > 0.05, `Listener did not move along the observable gesture (dot=${velocityDot}).`);
    assert(!Object.prototype.hasOwnProperty.call(afterAct.listener.lastReceivedAct || {}, 'target'), 'v56 smuggled hidden target coordinates to the listener.');

    // Let physical movement occur, then allow the speaker to evaluate that consequence.
    await page.evaluate(ticks => window.realitySandboxDebug.advance(ticks), STEP_TICKS);

    const afterFeedback = await page.evaluate(({ teacherId, listenerId }) => {
      const planet = window.realitySandboxPlanet;
      return {
        stats:window.realitySandboxCommunicativeIntentV56.getStats(),
        teacher:window.realitySandboxCommunicativeIntentV56.getIntent(teacherId),
        listenerPosition:{ ...planet.world.ecs.components.position.get(listenerId) },
      };
    }, setup);

    const successUtility = afterFeedback.teacher?.utilities?.['food:there'];
    assert(afterFeedback.stats.communicativeSuccesses > 0, 'Speaker never detected successful listener movement.');
    assert(afterFeedback.stats.utilityReinforcements > 0, 'Successful communication did not reinforce utility.');
    assert(Number.isFinite(successUtility) && successUtility > 0, `Successful food:there utility did not become positive (${successUtility}).`);

    // Replace the knowledgeable listener with a naive sleeping conspecific at the same v56-only range.
    const naive = await page.evaluate(({ teacherId, listenerId, distance }) => {
      const planet = window.realitySandboxPlanet;
      const c = planet.world.ecs.components;
      const teacher = c.motile.get(teacherId);
      const tp = c.position.get(teacherId);
      planet.world.ecs.destroyEntity(listenerId);

      const naiveId = planet.world.ecs.createEntity();
      c.position.set(naiveId, { x:(tp.x + distance) % planet.world.width, y:tp.y });
      c.velocity.set(naiveId, { vx:0, vy:0 });
      c.motile.set(naiveId, {
        lineageId:teacher.lineageId,
        generation:(teacher.generation || 0) + 2,
        plantAncestorId:teacher.plantAncestorId,
        energy:0.95,
        age:5,
        state:'sleeping',
        sleepDebt:0.9,
        decisionCooldown:0,
        neurotoxinLoad:0,
        genome:{ ...teacher.genome },
        bioV50:{ mode:'rest', drives:{ rest:1 }, hunger:0, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null },
        bioV51:null,
        bioV52:{ learningRate:0.9, retention:0.9, memories:{ food:null, danger:null, hunt:null }, recalledAction:null, recalledMemory:null, lastEnergy:0.95, formedAtStep:0, lastSocialReceivedAtStep:null },
        bioV53:{ openness:0.9, conformity:0.8, practices:{ 'food-route':null, 'danger-avoidance':null, 'pack-hunt':null }, appliedPractice:null, learnedFrom:null, lastEnergy:0.95, culturalAge:0 },
        bioV54:null,
        bioV55:{
          combinatorialCapacity:1,
          syntaxLearning:1,
          lexicon:{},
          production:{},
          syntaxOrder:null,
          syntaxConfidence:0,
          inventionCounter:0,
          observedPairMask:0,
          lastPhrase:null,
          lastHeardPhrase:null,
          interpretedComposition:null,
          appliedComposition:null,
        },
        bioV56:null,
      });
      c.velocity.set(teacherId, { vx:0, vy:0 });
      return { naiveId };
    }, setup);

    await page.evaluate(ticks => window.realitySandboxDebug.advance(ticks), STEP_TICKS);
    const naiveHeard = await page.evaluate(({ naiveId }) => ({
      intent:window.realitySandboxCommunicativeIntentV56.getIntent(naiveId),
      velocity:{ ...window.realitySandboxPlanet.world.ecs.components.velocity.get(naiveId) },
      stats:window.realitySandboxCommunicativeIntentV56.getStats(),
    }), naive);

    assert(naiveHeard.intent?.lastReceivedAct, 'Naive organism did not physically receive the intentional act.');
    assert(!naiveHeard.intent?.lastJointAttention, 'Naive organism understood a phrase without learned v55 decoding.');
    assert(naiveHeard.stats.failedDecodes > 0, 'v56 did not record the naive decoding failure.');

    // Repeated nonresponse must eventually alter the speaker's choice and suppress the act.
    for (let i = 0; i < 5; i++) {
      await page.evaluate(ticks => window.realitySandboxDebug.advance(ticks), STEP_TICKS);
    }

    const finalState = await page.evaluate(({ teacherId, naiveId, lineageId }) => {
      const intent = window.realitySandboxCommunicativeIntentV56;
      const inspector = window.realitySandboxEvolutionInspectorV47b;
      const intentInspector = window.realitySandboxCommunicativeIntentInspectorV56a;
      inspector.selectLineage(lineageId);
      inspector.open();
      intentInspector.render();
      const root = document.getElementById('evolutionInspectorV47bHost')?.shadowRoot;
      return {
        stats:intent.getStats(),
        teacher:intent.getIntent(teacherId),
        naive:intent.getIntent(naiveId),
        naiveVelocity:{ ...window.realitySandboxPlanet.world.ecs.components.velocity.get(naiveId) },
        inspectorStats:intentInspector.getStats(),
        inspectorText:root?.querySelector('.intent-v56-body')?.textContent || '',
        diagnostics:window.realitySandboxEvolutionDiagnosticsV48d?.invariants?.() || null,
        evolutionBuild:window.realitySandboxEvolutionBuild,
      };
    }, { ...setup, ...naive });

    const failedUtility = finalState.teacher?.utilities?.['food:there'];
    const naiveSpeed = Math.hypot(finalState.naiveVelocity.vx, finalState.naiveVelocity.vy);
    assert(finalState.stats.version === 'v56b-outcome-biased-communicative-intent', 'Wrong v56b runtime version.');
    assert(finalState.stats.audienceDirectedCommunication && finalState.stats.communicativeSuccessReinforcement && finalState.stats.listenerBehaviorFeedback, 'v56 communicative-intent contract is incomplete.');
    assert(finalState.stats.decodedResponseRequiredForSuccess && finalState.stats.outcomeBiasedCommunicationChoice && finalState.stats.failedActsCanBeSuppressed, 'v56 outcome-driven choice contract is incomplete.');
    assert(finalState.stats.staleUtteranceContextRejected, 'v56 still treats stale prior utterances as current communicative intent.');
    assert(finalState.stats.deicticJointAttention && finalState.stats.observableGestureDirection && finalState.stats.noHiddenTargetCoordinates, 'v56 joint-attention grounding contract is incomplete.');
    assert(finalState.stats.requiresLearnedV55Decoding && finalState.stats.noSpeakerSemanticMetadata, 'v56 bypassed learned language semantics.');
    assert(finalState.stats.physicallyLocalTransmission && finalState.stats.kinBiasedTransmission && finalState.stats.spatialHashing, 'v56 locality contract failed.');
    assert(finalState.stats.boundedIntentMemory && finalState.stats.maxIntentEntries === 9 && finalState.stats.pairSpace.length === 9, 'v56 intent memory is not constant-bounded.');
    assert(finalState.stats.communicativeFailures >= 3 && finalState.stats.utilityExtinctions >= 3, 'Speaker did not repeatedly learn from the naive listener’s nonresponse.');
    assert(finalState.stats.outcomeBiasedChoices > 0 && finalState.stats.suppressedActs > 0, 'Learned communicative utility never changed whether the speaker chose to emit.');
    assert(Number.isFinite(failedUtility) && failedUtility < 0, `Repeated failure did not drive food:there utility negative (${failedUtility}).`);
    assert(finalState.teacher?.lastChoice?.emitted === false, 'Speaker did not suppress the repeatedly unsuccessful communicative act.');
    assert(!finalState.naive?.lastJointAttention, 'Naive listener acquired joint attention without decoding.');
    assert(naiveSpeed < 0.05, `Naive sleeping organism moved despite failing to decode the phrase (speed=${naiveSpeed}).`);
    assert(finalState.inspectorStats.lineageIntentView && finalState.inspectorStats.communicativeUtilityView && finalState.inspectorStats.jointAttentionView && finalState.inspectorStats.outcomeChoiceView && finalState.inspectorStats.suppressionView && finalState.inspectorText.length > 0, 'v56 inspector did not expose learned communicative choice.');
    assert(finalState.evolutionBuild === 'evolution-v56-communicative-intent', `Unexpected evolution build ${finalState.evolutionBuild}.`);
    assert(finalState.diagnostics?.ok === true, `Evolution diagnostics failed: ${(finalState.diagnostics?.failures || []).join(' | ')}`);
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'communicative-intent-v56.json'), JSON.stringify({ setup, afterAct, afterFeedback, naive, naiveHeard, finalState, pageErrors }, null, 2));
    await page.screenshot({ path:path.join(artifactDir, 'communicative-intent-v56.png'), fullPage:true });
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
