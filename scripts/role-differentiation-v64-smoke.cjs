const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_ROLE_DIFFERENTIATION_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'role-differentiation-v64-smoke');
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
      window.realitySandboxRoleDifferentiationV64?.installed
    ), null, { timeout:120000 });

    const setup = await page.evaluate(() => {
      const planet = window.realitySandboxPlanet;
      const c = planet.world.ecs.components;
      for (const id of [...c.motile.keys()]) planet.world.ecs.destroyEntity(id);
      for (const [, res] of c.resource.entries()) res.amount = 0;
      for (const [, det] of c.detritus.entries()) det.amount = 0;

      const lineageId = 'v64-test-lineage';
      const y = planet.world.height * 0.52;
      const x = planet.world.width * 0.42;
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

      function add(px) {
        const id = planet.world.ecs.createEntity();
        c.position.set(id, { x:(px + planet.world.width) % planet.world.width, y });
        c.velocity.set(id, { vx:0, vy:0 });
        c.motile.set(id, {
          lineageId, generation:8, plantAncestorId:null, energy:1.1, age:22,
          state:'awake', sleepDebt:0.05, decisionCooldown:999, neurotoxinLoad:0,
          genome:{ ...genome },
          bioV50:{ mode:'rest', drives:{ rest:1 }, hunger:0, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null },
          bioV51:null, bioV52:null, bioV53:null, bioV54:null, bioV55:null,
          bioV56:baseV56(), bioV57:baseV57(), bioV58:null, bioV59:null, bioV60:null,
          bioV61:null, bioV62:baseV62(), bioV63:null, bioV64:null,
        });
        return id;
      }

      const initiatorId = add(x);
      const responderId = add(x + 72);
      const neutralId = add(x - 72);
      const responsiveId = add(x + 144);
      const unresponsiveId = add(x - 144);

      function model(id, responsiveness, successes, failures) {
        return {
          id, trust:0, responsiveness, familiarity:0.60,
          knowledge:{ food:0, danger:0, prey:0 },
          observations:3, successfulResponses:successes, failedResponses:failures,
          reliableClaims:0, unreliableClaims:0, lastSeenStep:0, lastInteractionStep:0,
        };
      }
      const initiator = c.motile.get(initiatorId);
      initiator.bioV57.models[String(responsiveId)] = model(responsiveId, 0.80, 3, 0);
      initiator.bioV57.models[String(unresponsiveId)] = model(unresponsiveId, -0.80, 0, 3);

      for (const id of [responderId, neutralId]) {
        const organism = c.motile.get(id);
        organism.bioV62.affiliations[String(initiatorId)] = {
          partnerId:initiatorId,
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

      return { initiatorId, responderId, neutralId, responsiveId, unresponsiveId, lineageId, genome };
    });

    const readRoles = () => page.evaluate(({ initiatorId, responderId, neutralId }) => ({
      initiator:window.realitySandboxRoleDifferentiationV64.getRole(initiatorId),
      responder:window.realitySandboxRoleDifferentiationV64.getRole(responderId),
      neutral:window.realitySandboxRoleDifferentiationV64.getRole(neutralId),
      stats:window.realitySandboxRoleDifferentiationV64.getStats(),
    }), setup);

    for (let round = 1; round <= 3; round++) {
      await page.evaluate(({ setup, round }) => {
        const c = window.realitySandboxPlanet.world.ecs.components;
        const initiator = c.motile.get(setup.initiatorId);
        initiator.bioV56.lastIntentionalAct = {
          audienceId:setup.responsiveId,
          tokens:['ka','ra'],
          gesture:{ x:1, y:0 },
          pairKey:'food:there',
          utility:0.4,
          willingness:0.8,
          step:100 + round,
        };
      }, { setup, round });
      await advanceUntil(
        readRoles,
        state => (state.initiator?.initiations || 0) >= round,
        `Initiative-history episode ${round}`,
        3
      );
    }

    for (let round = 1; round <= 3; round++) {
      await page.evaluate(({ setup, round }) => {
        const c = window.realitySandboxPlanet.world.ecs.components;
        const responder = c.motile.get(setup.responderId);
        responder.bioV56.lastJointAttention = {
          speakerId:setup.initiatorId,
          referent:'food',
          modifier:'there',
          gesture:{ x:1, y:0 },
          step:200 + round,
        };
      }, { setup, round });
      await advanceUntil(
        readRoles,
        state => (state.responder?.responses || 0) >= round,
        `Response-history episode ${round}`,
        4
      );
    }

    const differentiated = await readRoles();
    fs.writeFileSync(path.join(artifactDir, 'role-differentiation-v64-training.json'), JSON.stringify({ setup, differentiated, pageErrors }, null, 2));

    assert(differentiated.initiator.initiations >= 3 && differentiated.initiator.responses === 0, 'Initiator history was not learned from own v56 acts.');
    assert(differentiated.responder.responses >= 3 && differentiated.responder.initiations === 0, 'Responder history was not learned from own v63 applications.');
    assert(differentiated.initiator.initiativeTendency > 0.45, `Initiative history did not create positive differentiation (${differentiated.initiator.initiativeTendency}).`);
    assert(differentiated.responder.initiativeTendency < -0.45, `Response history did not create negative differentiation (${differentiated.responder.initiativeTendency}).`);
    assert(Math.abs(differentiated.neutral.initiativeTendency) < 1e-9 && differentiated.neutral.roleEvidence === 0, 'No-history control differentiated without experience.');

    const complementarity = await page.evaluate(({ initiatorId, responsiveId, unresponsiveId }) => {
      const roles = window.realitySandboxRoleDifferentiationV64;
      const social = window.realitySandboxSocialModelsV57;
      const goodAdjustment = roles.getComplementarityAdjustment(initiatorId, responsiveId);
      const badAdjustment = roles.getComplementarityAdjustment(initiatorId, unresponsiveId);
      const goodScore = social.scoreAudience(initiatorId, responsiveId, 0.50);
      const badScore = social.scoreAudience(initiatorId, unresponsiveId, 0.50);
      return {
        goodAdjustment,
        badAdjustment,
        goodScore,
        badScore,
        role:roles.getRole(initiatorId),
      };
    }, setup);

    assert(complementarity.goodAdjustment.adjustment > 0.015, `Known responsive partner got too little v64 complementarity bonus (${complementarity.goodAdjustment.adjustment}).`);
    assert(complementarity.badAdjustment.adjustment < -0.015, `Known unresponsive partner was not disfavored by v64 complementarity (${complementarity.badAdjustment.adjustment}).`);
    assert(complementarity.goodScore > complementarity.badScore, 'Initiative differentiation did not preserve complementary audience preference.');

    await page.evaluate(({ setup }) => {
      const c = window.realitySandboxPlanet.world.ecs.components;
      const responder = c.motile.get(setup.responderId);
      const neutral = c.motile.get(setup.neutralId);
      responder.bioV56.lastJointAttention = {
        speakerId:setup.initiatorId,
        referent:'food', modifier:'there', gesture:{ x:1, y:0 }, step:404,
      };
      neutral.bioV56.lastJointAttention = {
        speakerId:setup.initiatorId,
        referent:'food', modifier:'there', gesture:{ x:1, y:0 }, step:404,
      };
    }, { setup });

    const readCommitments = () => page.evaluate(({ responderId, neutralId }) => ({
      responder:window.realitySandboxCoalitionJointActionV63.getJointAction(responderId),
      neutral:window.realitySandboxCoalitionJointActionV63.getJointAction(neutralId),
      responderRole:window.realitySandboxRoleDifferentiationV64.getRole(responderId),
      neutralRole:window.realitySandboxRoleDifferentiationV64.getRole(neutralId),
      v63Stats:window.realitySandboxCoalitionJointActionV63.getStats(),
      v64Stats:window.realitySandboxRoleDifferentiationV64.getStats(),
      build:window.realitySandboxEvolutionBuild,
      dataset:document.documentElement.dataset.roleDifferentiationV64,
    }), setup);

    const commitments = await advanceUntil(
      readCommitments,
      state => Boolean(
        state.responder?.commitment?.sourceJointAttentionStep === 404 &&
        state.neutral?.commitment?.sourceJointAttentionStep === 404
      ),
      'History-conditioned v63 commitment comparison',
      4
    );

    assert(commitments.responder.commitment.durationAdjustment >= 1, 'Response history did not lengthen the future v63 commitment.');
    assert(commitments.responder.commitment.strengthAdjustment > 0.015, 'Response history did not strengthen the future v63 commitment.');
    assert(commitments.responder.commitment.totalSteps > commitments.responder.commitment.baseDuration, 'Responder-specialized commitment did not exceed its own v63 base duration.');
    assert(commitments.neutral.commitment.durationAdjustment === 0 && Math.abs(commitments.neutral.commitment.strengthAdjustment) < 1e-12, 'No-history control received a v64 commitment modifier.');
    assert(commitments.neutral.commitment.totalSteps === commitments.neutral.commitment.baseDuration, 'No-history control did not preserve the v63 base commitment.');

    const rawStates = await page.evaluate(({ initiatorId, responderId, neutralId }) => {
      const c = window.realitySandboxPlanet.world.ecs.components;
      return [initiatorId, responderId, neutralId].map(id => ({ id, state:{ ...c.motile.get(id).bioV64 } }));
    }, setup);
    for (const item of rawStates) {
      for (const forbidden of ['role','roleLabel','roleId','leader','leaderId','rank','assignment','groupRole','coalitionRole']) {
        assert(!(forbidden in item.state), `Organism ${item.id} stores forbidden explicit role/hierarchy field ${forbidden}.`);
      }
    }

    const flags = commitments.v64Stats;
    assert(flags.version === 'v64a-history-dependent-initiative-response', 'Wrong v64 runtime version.');
    assert(flags.rolesLearnedFromOwnHistoryOnly && flags.initiationsFromOwnV56Acts && flags.responsesFromOwnV63Applications, 'v64 own-history evidence contract failed.');
    assert(flags.noPartnerPrivateRoleInspection && flags.complementarityUsesOwnV57PartnerModel, 'v64 partner privacy/complementarity contract failed.');
    assert(flags.complementaryHistoryBiasesAudienceSelection && flags.responseHistoryModifiesFutureV63Commitment, 'v64 behavioral consequence contract failed.');
    assert(flags.noExplicitRoleLabels && flags.noLeaderOrRankState && flags.noStoredGroupRoleAssignment, 'v64 no-scripted-role/hierarchy contract failed.');
    assert(flags.historyCanBreakGeneticSymmetry && flags.scalarRoleMemory, 'v64 emergent scalar differentiation contract failed.');
    assert(flags.authoritativeFixedStep && flags.noHardPopulationCap && flags.noHardDisplayCap && !flags.surfaceRendererEnabled, 'v64 fixed-step/cap/renderer contract failed.');
    assert(commitments.v63Stats.commitmentModifierSupported && commitments.v63Stats.commitmentModifierInstalled, 'v63 generic commitment extension seam is not active under v64.');
    assert(commitments.dataset === 'history-dependent-complementarity', 'v64 dataset marker is not active.');
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'role-differentiation-v64.json'), JSON.stringify({
      setup, differentiated, complementarity, commitments, rawStates, pageErrors,
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
