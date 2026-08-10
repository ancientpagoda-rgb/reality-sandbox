const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_SOCIAL_MODELS_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'social-models-v57-smoke');
const STEP_TICKS = 15; // 15 * 0.06 s = one 0.9 s social-model update.
const TRAIN_DISTANCE = 226;
const NEAR_DISTANCE = 224;
const FAR_DISTANCE = 228;
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
      window.realitySandboxCompositionalLanguageV55?.installed &&
      window.realitySandboxCommunicativeIntentV56?.installed &&
      window.realitySandboxSocialModelsV57?.installed &&
      window.realitySandboxSocialModelsInspectorV57a?.installed
    ), null, { timeout:120000 });

    const setup = await page.evaluate(({ trainDistance }) => {
      const planet = window.realitySandboxPlanet;
      const c = planet.world.ecs.components;
      for (const id of [...c.motile.keys()]) planet.world.ecs.destroyEntity(id);
      for (const [, res] of c.resource.entries()) res.amount = 0;
      for (const [, det] of c.detritus.entries()) det.amount = 0;

      const lineageId = 'v57-test-lineage';
      const base = { x:planet.world.width * 0.34, y:planet.world.height * 0.52 };
      const target = { x:base.x, y:Math.max(32, base.y - 120) };
      const genome = {
        photosynthesis:0,
        heterotrophy:0.32,
        motility:0,
        sense:0.8,
        brainSpeed:1,
        sociality:0.8,
        dormancy:0.4,
        toxin:0,
        neurotoxin:0,
        scavenging:0,
        aggression:0,
        armor:0.2,
        seedInvestment:0.2,
        metabolism:0.05,
        bodySize:0.5,
      };

      function knownV54(learnedFrom) {
        return {
          vocality:1,
          receptivity:1,
          lexicon:{ ka:{ meaning:'food-route', confidence:0.98, learnedFrom, updatedAtStep:0 } },
          production:{ 'food-route':'ka' },
          inventionCounter:0,
          lastEmission:null,
          lastHeard:null,
          interpretedMeaning:null,
          appliedLanguageAction:null,
        };
      }

      function knownV55(learnedFrom, speaker = false) {
        return {
          combinatorialCapacity:1,
          syntaxLearning:1,
          lexicon:{
            ka:{ primitive:'food', confidence:0.98, learnedFrom, updatedAtStep:0 },
            ra:{ primitive:'there', confidence:0.98, learnedFrom, updatedAtStep:0 },
          },
          production:speaker ? { food:'ka', there:'ra' } : {},
          syntaxOrder:'referent-modifier',
          syntaxConfidence:0.98,
          inventionCounter:0,
          observedPairMask:0,
          lastPhrase:null,
          lastHeardPhrase:null,
          interpretedComposition:null,
          appliedComposition:null,
        };
      }

      function blankV55() {
        return {
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
        };
      }

      function baseV52() {
        return {
          learningRate:0.9,
          retention:0.9,
          memories:{ food:null, danger:null, hunt:null },
          recalledAction:null,
          recalledMemory:null,
          lastEnergy:0.9,
          formedAtStep:0,
          lastSocialReceivedAtStep:null,
        };
      }

      function baseV53() {
        return {
          openness:0.9,
          conformity:0.8,
          practices:{ 'food-route':null, 'danger-avoidance':null, 'pack-hunt':null },
          appliedPractice:null,
          learnedFrom:null,
          lastEnergy:0.9,
          culturalAge:0,
        };
      }

      function addMotile(x, languageKnown, speaker = false) {
        const id = planet.world.ecs.createEntity();
        c.position.set(id, { x, y:base.y });
        c.velocity.set(id, { vx:0, vy:0 });
        const bioV52 = baseV52();
        const bioV53 = baseV53();
        if (speaker) {
          bioV52.memories.food = { x:target.x, y:target.y, strength:1, targetId:null, source:'direct', updatedAtStep:0 };
          bioV52.recalledAction = 'seek-food';
          bioV52.recalledMemory = { type:'food', x:target.x, y:target.y, strength:1 };
          bioV53.practices['food-route'] = { x:target.x, y:target.y, targetId:null, strength:1, modelId:id, learnedAtStep:0, updatedAtStep:0 };
          bioV53.appliedPractice = 'food-route';
        }
        c.motile.set(id, {
          lineageId,
          generation:speaker ? 4 : 5,
          plantAncestorId:null,
          energy:0.9,
          age:12,
          state:'awake',
          sleepDebt:0.05,
          decisionCooldown:999,
          neurotoxinLoad:0,
          genome:{ ...genome },
          bioV50:{ mode:speaker ? 'explore' : 'rest', drives:speaker ? { explore:1 } : { rest:1 }, hunger:0, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null },
          bioV51:null,
          bioV52,
          bioV53,
          bioV54:languageKnown ? knownV54(id) : null,
          bioV55:languageKnown ? knownV55(id, speaker) : blankV55(),
          bioV56:null,
          bioV57:null,
        });
        return id;
      }

      const speakerId = addMotile(base.x, true, true);
      const reliableId = addMotile((base.x + trainDistance) % planet.world.width, true, false);
      const unreliableId = addMotile((base.x - trainDistance + planet.world.width) % planet.world.width, false, false);
      const evaluatorId = addMotile((base.x + planet.world.width * 0.44) % planet.world.width, true, false);

      c.motile.get(speakerId).bioV54 = knownV54(speakerId);
      c.motile.get(speakerId).bioV55 = knownV55(speakerId, true);
      for (const id of [reliableId, evaluatorId]) {
        c.motile.get(id).bioV54 = knownV54(speakerId);
        c.motile.get(id).bioV55 = knownV55(speakerId, false);
      }

      return { speakerId, reliableId, unreliableId, evaluatorId, lineageId, base, target, width:planet.world.width };
    }, { trainDistance:TRAIN_DISTANCE });

    async function trainAudience(activeId, inactiveIds, shouldDecode, repetitions) {
      for (let round = 0; round < repetitions; round++) {
        await page.evaluate(({ setup, activeId, inactiveIds, trainDistance }) => {
          const c = window.realitySandboxPlanet.world.ecs.components;
          const speaker = c.motile.get(setup.speakerId);
          const active = c.motile.get(activeId);
          speaker.state = 'awake';
          speaker.decisionCooldown = 999;
          if (speaker.bioV56) {
            speaker.bioV56.utilities['food:there'] = 0;
            speaker.bioV56.trials['food:there'] = 0;
            speaker.bioV56.pendingAct = null;
          }
          c.position.set(setup.speakerId, { ...setup.base });
          c.position.set(activeId, { x:(setup.base.x + trainDistance) % setup.width, y:setup.base.y });
          c.velocity.set(setup.speakerId, { vx:0, vy:0 });
          c.velocity.set(activeId, { vx:0, vy:0 });
          active.state = 'awake';
          active.decisionCooldown = 999;
          for (let i = 0; i < inactiveIds.length; i++) {
            const id = inactiveIds[i];
            const sign = i % 2 ? -1 : 1;
            c.position.set(id, { x:(setup.base.x + sign * setup.width * 0.44 + setup.width) % setup.width, y:setup.base.y });
            c.velocity.set(id, { vx:0, vy:0 });
          }
        }, { setup, activeId, inactiveIds, trainDistance:TRAIN_DISTANCE });

        await page.evaluate(ticks => window.realitySandboxDebug.advance(ticks), STEP_TICKS);
        const act = await page.evaluate(({ speakerId, activeId }) => {
          const state = window.realitySandboxCommunicativeIntentV56.getIntent(speakerId);
          return {
            audienceId:state?.lastIntentionalAct?.audienceId,
            activeJoint:window.realitySandboxCommunicativeIntentV56.getIntent(activeId)?.lastJointAttention || null,
          };
        }, { speakerId:setup.speakerId, activeId });
        assert(act.audienceId === activeId, `Training act addressed ${act.audienceId}, expected ${activeId}.`);
        if (shouldDecode) assert(act.activeJoint?.referent === 'food', 'Knowledgeable training listener did not decode food.');

        await page.evaluate(({ speakerId }) => {
          const speaker = window.realitySandboxPlanet.world.ecs.components.motile.get(speakerId);
          speaker.state = 'sleeping';
        }, { speakerId:setup.speakerId });
        await page.evaluate(ticks => window.realitySandboxDebug.advance(ticks), STEP_TICKS);

        await page.evaluate(({ speakerId }) => {
          const speaker = window.realitySandboxPlanet.world.ecs.components.motile.get(speakerId);
          speaker.state = 'awake';
          speaker.sleepDebt = 0.05;
          speaker.decisionCooldown = 999;
        }, { speakerId:setup.speakerId });
      }
    }

    await trainAudience(setup.reliableId, [setup.unreliableId, setup.evaluatorId], true, 2);
    await trainAudience(setup.unreliableId, [setup.reliableId, setup.evaluatorId], false, 2);

    const learnedInitial = await page.evaluate(({ speakerId, reliableId, unreliableId }) => {
      const social = window.realitySandboxSocialModelsV57.getSocialModel(speakerId);
      return {
        social,
        reliable:social?.models?.[String(reliableId)] || null,
        unreliable:social?.models?.[String(unreliableId)] || null,
        stats:window.realitySandboxSocialModelsV57.getStats(),
      };
    }, setup);

    assert(learnedInitial.reliable?.responsiveness > 0.25, `Reliable listener responsiveness was not reinforced (${learnedInitial.reliable?.responsiveness}).`);
    assert(learnedInitial.unreliable?.responsiveness < -0.25, `Unreliable listener responsiveness was not extinguished (${learnedInitial.unreliable?.responsiveness}).`);
    assert(learnedInitial.stats.outgoingOutcomeUpdates >= 4, 'v57 did not learn from outgoing communicative outcomes.');

    await page.evaluate(({ setup, nearDistance, farDistance }) => {
      const c = window.realitySandboxPlanet.world.ecs.components;
      const speaker = c.motile.get(setup.speakerId);
      speaker.state = 'awake';
      speaker.decisionCooldown = 999;
      if (speaker.bioV56) {
        speaker.bioV56.utilities['food:there'] = 0;
        speaker.bioV56.trials['food:there'] = 0;
        speaker.bioV56.pendingAct = null;
      }
      c.position.set(setup.speakerId, { ...setup.base });
      c.position.set(setup.unreliableId, { x:(setup.base.x + nearDistance) % setup.width, y:setup.base.y });
      c.position.set(setup.reliableId, { x:(setup.base.x - farDistance + setup.width) % setup.width, y:setup.base.y });
      c.position.set(setup.evaluatorId, { x:(setup.base.x + setup.width * 0.44) % setup.width, y:setup.base.y });
      for (const id of [setup.speakerId, setup.reliableId, setup.unreliableId, setup.evaluatorId]) c.velocity.set(id, { vx:0, vy:0 });
    }, { setup, nearDistance:NEAR_DISTANCE, farDistance:FAR_DISTANCE });
    await page.evaluate(ticks => window.realitySandboxDebug.advance(ticks), STEP_TICKS);

    const preferredFirst = await page.evaluate(({ speakerId }) => ({
      intent:window.realitySandboxCommunicativeIntentV56.getIntent(speakerId),
      social:window.realitySandboxSocialModelsV57.getSocialModel(speakerId),
      stats:window.realitySandboxSocialModelsV57.getStats(),
    }), { speakerId:setup.speakerId });
    assert(preferredFirst.intent?.lastIntentionalAct?.audienceId === setup.reliableId, 'Speaker did not prefer the learned responsive listener when it was slightly farther away.');
    assert(preferredFirst.stats.sociallyBiasedAudienceScores > 0, 'v57 audience score hook was never exercised.');

    await page.evaluate(({ speakerId }) => {
      window.realitySandboxPlanet.world.ecs.components.motile.get(speakerId).state = 'sleeping';
    }, { speakerId:setup.speakerId });
    await page.evaluate(ticks => window.realitySandboxDebug.advance(ticks), STEP_TICKS);
    await page.evaluate(({ setup }) => {
      const c = window.realitySandboxPlanet.world.ecs.components;
      const known = c.motile.get(setup.reliableId);
      const naive = c.motile.get(setup.unreliableId);
      known.bioV54 = null;
      known.bioV55 = {
        combinatorialCapacity:1, syntaxLearning:1, lexicon:{}, production:{}, syntaxOrder:null,
        syntaxConfidence:0, inventionCounter:0, observedPairMask:0, lastPhrase:null,
        lastHeardPhrase:null, interpretedComposition:null, appliedComposition:null,
      };
      naive.bioV54 = {
        vocality:1, receptivity:1,
        lexicon:{ ka:{ meaning:'food-route', confidence:0.98, learnedFrom:setup.speakerId, updatedAtStep:0 } },
        production:{}, inventionCounter:0, lastEmission:null, lastHeard:null,
        interpretedMeaning:null, appliedLanguageAction:null,
      };
      naive.bioV55 = {
        combinatorialCapacity:1, syntaxLearning:1,
        lexicon:{
          ka:{ primitive:'food', confidence:0.98, learnedFrom:setup.speakerId, updatedAtStep:0 },
          ra:{ primitive:'there', confidence:0.98, learnedFrom:setup.speakerId, updatedAtStep:0 },
        },
        production:{}, syntaxOrder:'referent-modifier', syntaxConfidence:0.98,
        inventionCounter:0, observedPairMask:0, lastPhrase:null, lastHeardPhrase:null,
        interpretedComposition:null, appliedComposition:null,
      };
      c.motile.get(setup.speakerId).state = 'awake';
    }, { setup });

    await trainAudience(setup.reliableId, [setup.unreliableId, setup.evaluatorId], false, 3);
    await trainAudience(setup.unreliableId, [setup.reliableId, setup.evaluatorId], true, 3);

    const reversed = await page.evaluate(({ speakerId, reliableId, unreliableId }) => {
      const social = window.realitySandboxSocialModelsV57.getSocialModel(speakerId);
      return {
        reliable:social?.models?.[String(reliableId)] || null,
        unreliable:social?.models?.[String(unreliableId)] || null,
      };
    }, setup);
    assert(reversed.reliable?.responsiveness < -0.20, `Former reliable listener did not become disfavored (${reversed.reliable?.responsiveness}).`);
    assert(reversed.unreliable?.responsiveness > 0.20, `Former unreliable listener did not become preferred after successful responses (${reversed.unreliable?.responsiveness}).`);

    await page.evaluate(({ setup, nearDistance, farDistance }) => {
      const c = window.realitySandboxPlanet.world.ecs.components;
      const speaker = c.motile.get(setup.speakerId);
      speaker.state = 'awake';
      speaker.decisionCooldown = 999;
      if (speaker.bioV56) {
        speaker.bioV56.utilities['food:there'] = 0;
        speaker.bioV56.trials['food:there'] = 0;
        speaker.bioV56.pendingAct = null;
      }
      c.position.set(setup.speakerId, { ...setup.base });
      c.position.set(setup.reliableId, { x:(setup.base.x + nearDistance) % setup.width, y:setup.base.y });
      c.position.set(setup.unreliableId, { x:(setup.base.x - farDistance + setup.width) % setup.width, y:setup.base.y });
      c.position.set(setup.evaluatorId, { x:(setup.base.x + setup.width * 0.44) % setup.width, y:setup.base.y });
      for (const id of [setup.speakerId, setup.reliableId, setup.unreliableId, setup.evaluatorId]) c.velocity.set(id, { vx:0, vy:0 });
    }, { setup, nearDistance:NEAR_DISTANCE, farDistance:FAR_DISTANCE });
    await page.evaluate(ticks => window.realitySandboxDebug.advance(ticks), STEP_TICKS);
    const preferredAfterReversal = await page.evaluate(({ speakerId }) => window.realitySandboxCommunicativeIntentV56.getIntent(speakerId), { speakerId:setup.speakerId });
    assert(preferredAfterReversal?.lastIntentionalAct?.audienceId === setup.unreliableId, 'Speaker preference did not update after the partners reversed their response histories.');

    await page.evaluate(({ setup, trainDistance }) => {
      const c = window.realitySandboxPlanet.world.ecs.components;
      const speaker = c.motile.get(setup.speakerId);
      const evaluator = c.motile.get(setup.evaluatorId);
      speaker.state = 'awake';
      speaker.decisionCooldown = 999;
      if (speaker.bioV56) {
        speaker.bioV56.utilities['food:there'] = 0;
        speaker.bioV56.trials['food:there'] = 0;
        speaker.bioV56.pendingAct = null;
      }
      evaluator.bioV57 = null;
      evaluator.bioV52.memories.food = null;
      evaluator.bioV50.targetPlant = null;
      evaluator.bioV50.targetDetritus = null;
      c.position.set(setup.speakerId, { ...setup.base });
      c.position.set(setup.evaluatorId, { x:(setup.base.x + trainDistance) % setup.width, y:setup.base.y });
      c.position.set(setup.reliableId, { x:(setup.base.x + setup.width * 0.44) % setup.width, y:setup.base.y });
      c.position.set(setup.unreliableId, { x:(setup.base.x - setup.width * 0.44 + setup.width) % setup.width, y:setup.base.y });
      for (const id of [setup.speakerId, setup.evaluatorId, setup.reliableId, setup.unreliableId]) c.velocity.set(id, { vx:0, vy:0 });
    }, { setup, trainDistance:TRAIN_DISTANCE });

    await page.evaluate(ticks => window.realitySandboxDebug.advance(ticks), STEP_TICKS);
    const beforeEvidence = await page.evaluate(({ evaluatorId, speakerId }) => {
      const social = window.realitySandboxSocialModelsV57.getSocialModel(evaluatorId);
      return social?.models?.[String(speakerId)] || null;
    }, { evaluatorId:setup.evaluatorId, speakerId:setup.speakerId });
    assert(beforeEvidence && Math.abs(beforeEvidence.trust) < 0.01, `Listener granted trust merely for decoding (${beforeEvidence?.trust}).`);
    assert((beforeEvidence.knowledge?.food || 0) < 0.01, 'Listener attributed food knowledge before checking any consequence.');

    await page.evaluate(({ setup }) => {
      const c = window.realitySandboxPlanet.world.ecs.components;
      const speaker = c.motile.get(setup.speakerId);
      const evaluator = c.motile.get(setup.evaluatorId);
      speaker.state = 'sleeping';
      evaluator.bioV52.memories.food = {
        x:setup.target.x, y:setup.target.y, strength:1, targetId:null,
        source:'direct', updatedAtStep:999999,
      };
    }, { setup });
    await page.evaluate(ticks => window.realitySandboxDebug.advance(ticks), STEP_TICKS);

    const afterEvidence = await page.evaluate(({ evaluatorId, speakerId }) => {
      const social = window.realitySandboxSocialModelsV57.getSocialModel(evaluatorId);
      return {
        model:social?.models?.[String(speakerId)] || null,
        stats:window.realitySandboxSocialModelsV57.getStats(),
        inspector:window.realitySandboxSocialModelsInspectorV57a.getStats(),
        build:window.realitySandboxEvolutionBuild,
        dataset:document.documentElement.dataset.socialModelsV57,
      };
    }, { evaluatorId:setup.evaluatorId, speakerId:setup.speakerId });

    assert(afterEvidence.model?.trust > 0.20, `Own observed food consequence did not reinforce speaker trust (${afterEvidence.model?.trust}).`);
    assert(afterEvidence.model?.knowledge?.food > 0.20, 'Own observed food consequence did not support a speaker-knowledge estimate.');
    assert(afterEvidence.stats.version === 'v57b-observed-outcome-social-models', 'Wrong v57 runtime version.');
    assert(afterEvidence.stats.evidenceFromOwnInteractionsOnly && afterEvidence.stats.noPrivateStateInspection, 'v57 evidence/privacy contract is incomplete.');
    assert(afterEvidence.stats.trustNotGrantedByDecodeAlone && afterEvidence.stats.inferredPartnerKnowledgeRequiresObservedOutcome, 'v57 trust/knowledge grounding contract is incomplete.');
    assert(afterEvidence.stats.socialModelsBiasAudienceSelection && afterEvidence.stats.boundedPartnerModels && afterEvidence.stats.maxPartnerModels === 8, 'v57 bounded selective-audience contract is incomplete.');
    assert(afterEvidence.stats.authoritativeFixedStep && afterEvidence.stats.noHardPopulationCap && afterEvidence.stats.noHardDisplayCap, 'v57 simulation invariants failed.');
    assert(afterEvidence.inspector?.individualPartnerView && afterEvidence.inspector?.trustView && afterEvidence.inspector?.responsivenessView && afterEvidence.inspector?.inferredKnowledgeView, 'v57 inspector contract failed.');
    assert(afterEvidence.build === 'evolution-v57-social-models' && afterEvidence.dataset === 'observed-outcome-partners', 'v57 build marker is not active.');
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'social-models-v57.json'), JSON.stringify({
      setup,
      learnedInitial,
      preferredFirst,
      reversed,
      preferredAfterReversal,
      beforeEvidence,
      afterEvidence,
      pageErrors,
    }, null, 2));
    await page.screenshot({ path:path.join(artifactDir, 'social-models-v57.png'), fullPage:true });
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
