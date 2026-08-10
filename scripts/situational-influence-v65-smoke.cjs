const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_SITUATIONAL_INFLUENCE_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'situational-influence-v65-smoke');
const STEP_TICKS = 15;
fs.mkdirSync(artifactDir, { recursive:true });

(async () => {
  const browser = await chromium.launch({
    headless:true,
    args:['--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--disable-dev-shm-usage','--no-sandbox'],
  });
  const page = await browser.newPage({ viewport:{ width:1280, height:800 }, deviceScaleFactor:1 });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  async function advanceUntil(readSnapshot, ready, label, maxCadences = 5) {
    let snapshot = null;
    for (let cadence = 0; cadence < maxCadences; cadence++) {
      await page.evaluate(ticks => window.realitySandboxDebug.advance(ticks), STEP_TICKS);
      snapshot = await readSnapshot();
      if (ready(snapshot)) return snapshot;
    }
    throw new Error(`${label} did not occur within ${maxCadences} cadences. ${JSON.stringify(snapshot)}`);
  }

  try {
    await page.goto(baseUrl, { waitUntil:'domcontentloaded', timeout:120000 });
    await page.waitForFunction(() => Boolean(
      window.realitySandboxDebug?.ready &&
      window.realitySandboxSocialModelsV57?.installed &&
      window.realitySandboxCoalitionJointActionV63?.installed &&
      window.realitySandboxRoleDifferentiationV64?.installed &&
      window.realitySandboxSituationalInfluenceV65?.installed
    ), null, { timeout:120000 });

    const setup = await page.evaluate(() => {
      const planet = window.realitySandboxPlanet;
      const c = planet.world.ecs.components;
      for (const id of [...c.motile.keys()]) planet.world.ecs.destroyEntity(id);
      for (const [, res] of c.resource.entries()) res.amount = 0;
      for (const [, det] of c.detritus.entries()) det.amount = 0;

      const lineageId = 'v65-test-lineage';
      const y = planet.world.height * 0.52;
      const x = planet.world.width * 0.43;
      const genome = {
        photosynthesis:0, heterotrophy:0.08, motility:0.30, sense:0.60, brainSpeed:0.70,
        sociality:0.70, dormancy:0.4, toxin:0, neurotoxin:0, scavenging:0,
        aggression:0, armor:0.2, seedInvestment:0.2, metabolism:0.01, bodySize:0.5,
      };

      function baseV56() {
        return {
          audienceAwareness:0.8, feedbackLearning:0.8, pointingControl:0.8,
          utilities:{}, trials:{}, pendingAct:null, lastChoice:null,
          lastIntentionalAct:null, lastReceivedAct:null, lastJointAttention:null,
          attendedSpeakerId:null,
        };
      }

      function baseV57() {
        return {
          socialInference:0.75, partnerMemory:0.75, attentionSelectivity:0.75,
          models:{}, preferredPartnerId:null, preferredPartnerScore:0,
          lastReceivedStep:-1, lastCapturedActStep:-1,
          pendingAudienceEvidence:null, pendingSpeakerEvidence:null,
          lastSocialGuidance:null,
        };
      }

      function baseV62() {
        return {
          affiliationLearning:0.75, loyalty:0.70, partnerSelectivity:0.70,
          affiliations:{}, preferredAffiliateId:null, preferredAffiliateScore:0,
          lastAudienceAdjustment:null,
        };
      }

      function responseRole() {
        return {
          roleLearning:0.70,
          complementaritySensitivity:0.70,
          persistencePlasticity:0.70,
          initiativeTendency:-0.65,
          roleEvidence:4,
          initiations:0,
          responses:4,
          lastInitiationKey:null,
          lastResponseKey:'preloaded-response-history',
          lastRoleUpdate:null,
          lastComplementarityAdjustment:null,
          lastCommitmentAdjustment:null,
        };
      }

      function add(px) {
        const id = planet.world.ecs.createEntity();
        c.position.set(id, { x:(px + planet.world.width) % planet.world.width, y });
        c.velocity.set(id, { vx:0, vy:0 });
        c.motile.set(id, {
          lineageId, generation:9, plantAncestorId:null, energy:1.1, age:24,
          state:'awake', sleepDebt:0.05, decisionCooldown:999, neurotoxinLoad:0,
          genome:{ ...genome },
          bioV50:{ mode:'rest', drives:{ rest:1 }, hunger:0, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null },
          bioV51:null, bioV52:null, bioV53:null, bioV54:null, bioV55:null,
          bioV56:baseV56(), bioV57:baseV57(), bioV58:null, bioV59:null, bioV60:null,
          bioV61:null, bioV62:baseV62(), bioV63:null, bioV64:null, bioV65:null,
        });
        return id;
      }

      const speakerAId = add(x);
      const speakerBId = add(x + 60);
      const listener1Id = add(x - 70);
      const listener2Id = add(x - 130);

      // Speaker-private v64 states deliberately disagree. v65 must not inspect
      // these when listeners decide whom to trust.
      c.motile.get(speakerAId).bioV64 = {
        ...responseRole(), initiativeTendency:-0.90, roleEvidence:4, responses:4,
      };
      c.motile.get(speakerBId).bioV64 = {
        ...responseRole(), initiativeTendency:0.90, roleEvidence:4, responses:0, initiations:4,
      };
      c.motile.get(listener1Id).bioV64 = responseRole();
      c.motile.get(listener2Id).bioV64 = responseRole();

      function model(id, trust, reliableClaims, unreliableClaims) {
        return {
          id,
          trust,
          responsiveness:0,
          familiarity:0.70,
          knowledge:{ food:0, danger:0, prey:0 },
          observations:3,
          successfulResponses:0,
          failedResponses:0,
          reliableClaims,
          unreliableClaims,
          lastSeenStep:0,
          lastInteractionStep:0,
        };
      }

      const l1 = c.motile.get(listener1Id);
      const l2 = c.motile.get(listener2Id);
      l1.bioV57.models[String(speakerAId)] = model(speakerAId, 0.80, 3, 0);
      l1.bioV57.models[String(speakerBId)] = model(speakerBId, -0.70, 0, 3);
      l2.bioV57.models[String(speakerAId)] = model(speakerAId, 0.76, 3, 0);
      l2.bioV57.models[String(speakerBId)] = model(speakerBId, -0.20, 0, 1);

      function affiliate(listener, speakerId) {
        listener.bioV62.affiliations[String(speakerId)] = {
          partnerId:speakerId,
          affinity:0.60,
          evidenceStrength:0.50,
          directAidEvidence:0.60,
          communicationEvidence:0,
          witnessedProsocialEvidence:0,
          sourceMask:1,
          lastEvidenceStep:0,
          updatedAtStep:0,
        };
      }
      for (const listener of [l1, l2]) {
        affiliate(listener, speakerAId);
        affiliate(listener, speakerBId);
      }

      return { speakerAId, speakerBId, listener1Id, listener2Id, lineageId };
    });

    const readInfluence = () => page.evaluate(({ speakerAId, speakerBId, listener1Id, listener2Id }) => ({
      l1A:window.realitySandboxSituationalInfluenceV65.getInfluence(listener1Id, speakerAId),
      l1B:window.realitySandboxSituationalInfluenceV65.getInfluence(listener1Id, speakerBId),
      l2A:window.realitySandboxSituationalInfluenceV65.getInfluence(listener2Id, speakerAId),
      l2B:window.realitySandboxSituationalInfluenceV65.getInfluence(listener2Id, speakerBId),
      graph:window.realitySandboxSituationalInfluenceV65.getInfluenceGraph(),
      stats:window.realitySandboxSituationalInfluenceV65.getStats(),
      v63Stats:window.realitySandboxCoalitionJointActionV63.getStats(),
    }), setup);

    const initial = await advanceUntil(
      readInfluence,
      state => state.graph.incoming.some(item => item.speakerId === setup.speakerAId && item.observers >= 2),
      'Independent convergence on reliable speaker A',
      4
    );
    fs.writeFileSync(path.join(artifactDir, 'situational-influence-v65-initial.json'), JSON.stringify({ setup, initial, pageErrors }, null, 2));

    assert(initial.l1A.score > 0.30 && initial.l2A.score > 0.30, 'Independent listeners did not derive strong positive influence for reliable A.');
    assert(initial.l1B.score < -0.20, 'L1 did not derive negative influence for unreliable B.');
    assert(initial.graph.edges.some(edge => edge.observerId === setup.listener1Id && edge.speakerId === setup.speakerAId), 'L1→A influence edge is missing.');
    assert(initial.graph.edges.some(edge => edge.observerId === setup.listener2Id && edge.speakerId === setup.speakerAId), 'L2→A influence edge is missing.');
    const initialA = initial.graph.incoming.find(item => item.speakerId === setup.speakerAId);
    assert(initialA?.observers === 2, `A did not receive exactly two independent influence edges (${initialA?.observers}).`);
    assert(initial.stats.concentratedInfluencers >= 1, 'Derived graph did not detect concentrated situational influence.');
    assert(initial.v63Stats.multipleCommitmentModifiersSupported && initial.v63Stats.commitmentModifierCount >= 2, 'v63 did not retain composable v64+v65 modifiers.');

    await page.evaluate(({ setup }) => {
      const c = window.realitySandboxPlanet.world.ecs.components;
      const l1 = c.motile.get(setup.listener1Id);
      l1.bioV56.lastJointAttention = {
        speakerId:setup.speakerAId,
        referent:'food', modifier:'there', gesture:{ x:1, y:0 }, step:501,
      };
    }, { setup });

    const readL1 = () => page.evaluate(({ listener1Id }) => ({
      joint:window.realitySandboxCoalitionJointActionV63.getJointAction(listener1Id),
      influence:window.realitySandboxSituationalInfluenceV65.getInfluenceState(listener1Id),
      role:window.realitySandboxRoleDifferentiationV64.getRole(listener1Id),
      stats:window.realitySandboxSituationalInfluenceV65.getStats(),
    }), setup);

    const trustedA = await advanceUntil(
      readL1,
      state => state.joint?.commitment?.sourceJointAttentionStep === 501,
      'Trusted A commitment',
      4
    );
    const aContribs = trustedA.joint.commitment.modifierContributions || [];
    assert(aContribs.some(item => item.index === 0 && item.durationAdjustment > 0), 'v64 response specialization did not remain modifier slot 0.');
    assert(aContribs.some(item => item.index === 1 && item.durationAdjustment > 0), 'Positive v65 influence did not add modifier slot 1.');
    assert(trustedA.joint.commitment.totalSteps === 6, `Trusted A commitment did not reach bounded 6-cadence persistence (${trustedA.joint.commitment.totalSteps}).`);
    assert(trustedA.influence?.lastInfluenceAdjustment?.speakerId === setup.speakerAId && trustedA.influence.lastInfluenceAdjustment.influenceScore > 0, 'Positive A influence adjustment was not recorded.');

    await page.evaluate(({ setup }) => {
      const c = window.realitySandboxPlanet.world.ecs.components;
      const l1 = c.motile.get(setup.listener1Id);
      l1.bioV63.commitment = null;
      l1.bioV56.lastJointAttention = {
        speakerId:setup.speakerBId,
        referent:'food', modifier:'there', gesture:{ x:1, y:0 }, step:502,
      };
    }, { setup });

    const distrustedB = await advanceUntil(
      readL1,
      state => state.joint?.commitment?.sourceJointAttentionStep === 502,
      'Distrusted B commitment',
      4
    );
    const bContribs = distrustedB.joint.commitment.modifierContributions || [];
    assert(bContribs.some(item => item.index === 0 && item.durationAdjustment > 0), 'v64 response specialization disappeared for B.');
    assert(bContribs.some(item => item.index === 1 && item.durationAdjustment < 0), 'Negative v65 outcome history did not reduce B commitment.');
    assert(distrustedB.joint.commitment.totalSteps < trustedA.joint.commitment.totalSteps, 'Trusted and distrusted speakers produced no persistence difference.');
    assert(distrustedB.influence?.lastInfluenceAdjustment?.speakerId === setup.speakerBId && distrustedB.influence.lastInfluenceAdjustment.influenceScore < 0, 'Negative B influence adjustment was not recorded.');

    await page.evaluate(({ setup }) => {
      const c = window.realitySandboxPlanet.world.ecs.components;
      const l1 = c.motile.get(setup.listener1Id);
      const a = l1.bioV57.models[String(setup.speakerAId)];
      const b = l1.bioV57.models[String(setup.speakerBId)];
      a.trust = -0.78; a.reliableClaims = 0; a.unreliableClaims = 3; a.observations = 3; a.familiarity = 0.70;
      b.trust = 0.82; b.reliableClaims = 3; b.unreliableClaims = 0; b.observations = 3; b.familiarity = 0.70;
    }, { setup });

    const reversed = await advanceUntil(
      readInfluence,
      state =>
        state.l1A.score < -0.20 && state.l1B.score > 0.30 &&
        state.graph.edges.some(edge => edge.observerId === setup.listener1Id && edge.speakerId === setup.speakerBId) &&
        !state.graph.edges.some(edge => edge.observerId === setup.listener1Id && edge.speakerId === setup.speakerAId),
      'L1 influence reversal after own outcomes change',
      4
    );

    const reverseA = reversed.graph.incoming.find(item => item.speakerId === setup.speakerAId);
    const reverseB = reversed.graph.incoming.find(item => item.speakerId === setup.speakerBId);
    assert(reverseA?.observers === 1, `A influence did not fall from two observers to one (${reverseA?.observers}).`);
    assert(reverseB?.observers === 1, `B did not gain L1 as its new sole influenced observer (${reverseB?.observers}).`);
    assert(reversed.l2A.score > 0.30, 'L2 private evidence changed when only L1 history was reversed.');
    assert(reversed.stats.concentratedInfluencers === 0, 'Concentrated influence persisted after independent listener histories diverged.');

    await page.evaluate(({ setup }) => {
      const c = window.realitySandboxPlanet.world.ecs.components;
      const l1 = c.motile.get(setup.listener1Id);
      l1.bioV63.commitment = null;
      l1.bioV56.lastJointAttention = {
        speakerId:setup.speakerBId,
        referent:'food', modifier:'there', gesture:{ x:1, y:0 }, step:503,
      };
    }, { setup });

    const trustedBAfter = await advanceUntil(
      readL1,
      state => state.joint?.commitment?.sourceJointAttentionStep === 503,
      'B commitment after influence reversal',
      4
    );
    assert(trustedBAfter.joint.commitment.modifierContributions.some(item => item.index === 1 && item.durationAdjustment > 0), 'B did not gain positive v65 persistence after L1 outcome reversal.');
    assert(trustedBAfter.influence?.lastInfluenceAdjustment?.speakerId === setup.speakerBId && trustedBAfter.influence.lastInfluenceAdjustment.influenceScore > 0, 'Reversed positive B influence was not recorded.');

    const raw = await page.evaluate(({ speakerAId, speakerBId, listener1Id, listener2Id }) => {
      const c = window.realitySandboxPlanet.world.ecs.components;
      return [speakerAId, speakerBId, listener1Id, listener2Id].map(id => ({
        id,
        bioV65:c.motile.get(id).bioV65 ? { ...c.motile.get(id).bioV65 } : null,
        bioV64:c.motile.get(id).bioV64 ? { ...c.motile.get(id).bioV64 } : null,
      }));
    }, setup);
    for (const item of raw) {
      const state = item.bioV65 || {};
      for (const forbidden of ['leader','leaderId','rank','office','authority','authorityId','influencerId','leadershipRole','membership','groupId','coalitionId']) {
        assert(!(forbidden in state), `Organism ${item.id} stores forbidden v65 leadership/authority field ${forbidden}.`);
      }
    }

    const final = await page.evaluate(() => ({
      graph:window.realitySandboxSituationalInfluenceV65.getInfluenceGraph(),
      stats:window.realitySandboxSituationalInfluenceV65.getStats(),
      v63Stats:window.realitySandboxCoalitionJointActionV63.getStats(),
      build:window.realitySandboxEvolutionBuild,
      dataset:document.documentElement.dataset.situationalInfluenceV65,
    }));
    const flags = final.stats;
    assert(flags.version === 'v65a-derived-situational-influence', 'Wrong v65 runtime version.');
    assert(flags.influenceFromOwnV57OutcomesOnly && flags.responseReadinessFromOwnV64History, 'v65 own-history influence contract failed.');
    assert(flags.noSpeakerPrivateRoleInspection && flags.noGlobalLeaderState && flags.noLeaderRankOrOffice && flags.noStoredInfluenceMembership, 'v65 no-authority-state contract failed.');
    assert(flags.influenceGraphDerivedOnDemand && flags.multipleObserversCanConvergeIndependently && flags.influenceCanMoveWhenOutcomesChange, 'v65 derived/reversible influence contract failed.');
    assert(flags.influenceModifiesBoundedV63Commitment && flags.negativeOutcomesCanReduceCommitment, 'v65 physical influence consequence contract failed.');
    assert(flags.authoritativeFixedStep && flags.noHardPopulationCap && flags.noHardDisplayCap && !flags.surfaceRendererEnabled, 'v65 fixed-step/cap/renderer contract failed.');
    assert(final.v63Stats.multipleCommitmentModifiersSupported && final.v63Stats.commitmentModifierCount >= 2 && final.v63Stats.maxCommitmentSteps === 6, 'v63 composable bounded-modifier contract failed under v65.');
    assert(final.build === 'evolution-v65-situational-influence', 'v65 evolution build marker is not active.');
    assert(final.dataset === 'derived-reversible-influence', 'v65 dataset marker is not active.');
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'situational-influence-v65.json'), JSON.stringify({
      setup, initial, trustedA, distrustedB, reversed, trustedBAfter, raw, final, pageErrors,
    }, null, 2));
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
