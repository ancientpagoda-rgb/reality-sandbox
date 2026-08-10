const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_DISTRIBUTED_PLANNING_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'distributed-planning-v67-smoke');
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

  async function advanceUntil(readSnapshot, ready, label, maxCadences = 4) {
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
      window.realitySandboxDistributedConsensusV66?.installed &&
      window.realitySandboxDistributedPlanningV67?.installed
    ), null, { timeout:120000 });

    const setup = await page.evaluate(() => {
      const planet = window.realitySandboxPlanet;
      const c = planet.world.ecs.components;
      for (const id of [...c.motile.keys()]) planet.world.ecs.destroyEntity(id);
      for (const [, res] of c.resource.entries()) res.amount = 0;
      for (const [, det] of c.detritus.entries()) det.amount = 0;

      const lineageId = 'v67-test-lineage';
      const y = planet.world.height * 0.50;
      const x = planet.world.width * 0.44;
      const genome = {
        photosynthesis:0, heterotrophy:0.08, motility:0.32, sense:0.62, brainSpeed:0.72,
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

      function knownV55() {
        return {
          combinatorialCapacity:0.8,
          syntaxLearning:0.8,
          lexicon:{
            ka:{ primitive:'food', confidence:0.92, sourceId:null },
            ra:{ primitive:'there', confidence:0.92, sourceId:null },
          },
          production:{ food:'ka', there:'ra' },
          syntaxOrder:'referent-modifier',
          syntaxConfidence:0.90,
          inventionCounter:0,
          observedPairMask:0,
          lastPhrase:null,
          lastHeardPhrase:null,
          interpretedComposition:null,
          appliedComposition:null,
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
          lastResponseKey:'v67-response-history',
          lastRoleUpdate:null,
          lastComplementarityAdjustment:null,
          lastCommitmentAdjustment:null,
        };
      }

      function model(id, trust, reliableClaims, unreliableClaims) {
        return {
          id, trust, responsiveness:0, familiarity:0.72,
          knowledge:{ food:0, danger:0, prey:0 },
          observations:3, successfulResponses:0, failedResponses:0,
          reliableClaims, unreliableClaims, lastSeenStep:0, lastInteractionStep:0,
        };
      }

      function add(px, py) {
        const id = planet.world.ecs.createEntity();
        c.position.set(id, { x:(px + planet.world.width) % planet.world.width, y:py });
        c.velocity.set(id, { vx:0, vy:0 });
        c.motile.set(id, {
          lineageId, generation:11, plantAncestorId:null, energy:1.25, age:28,
          state:'awake', sleepDebt:0.02, decisionCooldown:999, neurotoxinLoad:0,
          genome:{ ...genome },
          bioV50:{ mode:'rest', drives:{ rest:1 }, hunger:0, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null },
          bioV51:null, bioV52:null, bioV53:null, bioV54:null, bioV55:knownV55(),
          bioV56:baseV56(), bioV57:baseV57(), bioV58:null, bioV59:null, bioV60:null,
          bioV61:null, bioV62:null, bioV63:null, bioV64:null, bioV65:null, bioV66:null, bioV67:null,
        });
        return id;
      }

      const eastId = add(x - 80, y - 60);
      const northId = add(x, y - 85);
      const southId = add(x + 80, y - 60);
      const listener1Id = add(x - 35, y + 55);
      const listener2Id = add(x + 35, y + 55);

      const l1 = c.motile.get(listener1Id);
      const l2 = c.motile.get(listener2Id);
      l1.bioV64 = responseRole();
      l2.bioV64 = responseRole();

      for (const listener of [l1, l2]) {
        listener.bioV57.models[String(eastId)] = model(eastId, 0.82, 3, 0);
      }
      l1.bioV57.models[String(northId)] = model(northId, 0.84, 4, 0);
      l1.bioV57.models[String(southId)] = model(southId, -0.76, 0, 4);
      l2.bioV57.models[String(northId)] = model(northId, -0.76, 0, 4);
      l2.bioV57.models[String(southId)] = model(southId, 0.84, 4, 0);

      return { eastId, northId, southId, listener1Id, listener2Id, lineageId };
    });

    const read = () => page.evaluate(({ listener1Id, listener2Id }) => ({
      l1Decision:window.realitySandboxDistributedConsensusV66.getDecision(listener1Id),
      l2Decision:window.realitySandboxDistributedConsensusV66.getDecision(listener2Id),
      l1Plan:window.realitySandboxDistributedPlanningV67.getPlan(listener1Id),
      l2Plan:window.realitySandboxDistributedPlanningV67.getPlan(listener2Id),
      stats:window.realitySandboxDistributedPlanningV67.getStats(),
      build:window.realitySandboxEvolutionBuild,
      dataset:document.documentElement.dataset.distributedPlanningV67,
    }), setup);

    async function emitEast(round) {
      await page.evaluate(({ setup, round }) => {
        const c = window.realitySandboxPlanet.world.ecs.components;
        c.motile.get(setup.eastId).bioV56.lastIntentionalAct = {
          audienceId:-1, tokens:['ka','ra'], gesture:{ x:1, y:0 },
          pairKey:'hidden:wrong', utility:-1, willingness:0,
          step:3000 + round * 10 + 1,
        };
      }, { setup, round });
      return advanceUntil(
        read,
        state => state.l1Decision?.lastLocalDecision?.sector === 0 && state.l2Decision?.lastLocalDecision?.sector === 0,
        `Round ${round} shared east first step`,
        4
      );
    }

    async function emitDivergentSecond(round) {
      await page.evaluate(({ setup, round }) => {
        const c = window.realitySandboxPlanet.world.ecs.components;
        c.motile.get(setup.northId).bioV56.lastIntentionalAct = {
          audienceId:-1, tokens:['ka','ra'], gesture:{ x:0, y:1 },
          pairKey:'hidden:wrong', utility:-1, willingness:0,
          step:3000 + round * 10 + 2,
        };
        c.motile.get(setup.southId).bioV56.lastIntentionalAct = {
          audienceId:-1, tokens:['ka','ra'], gesture:{ x:0, y:-1 },
          pairKey:'hidden:wrong', utility:1, willingness:1,
          step:3000 + round * 10 + 3,
        };
      }, { setup, round });
      return advanceUntil(
        read,
        state => state.l1Decision?.lastLocalDecision?.sector === 2 && state.l2Decision?.lastLocalDecision?.sector === 6,
        `Round ${round} divergent private second step`,
        4
      );
    }

    for (let round = 1; round <= 3; round++) {
      await emitEast(round);
      await emitDivergentSecond(round);
    }

    const trained = await read();
    fs.writeFileSync(path.join(artifactDir, 'distributed-planning-v67-trained.json'), JSON.stringify({ setup, trained, pageErrors }, null, 2));

    const l1EastNorth = trained.l1Plan.transitions['food:there:0>food:there:2'];
    const l2EastSouth = trained.l2Plan.transitions['food:there:0>food:there:6'];
    assert(l1EastNorth?.successes >= 2 && l1EastNorth.confidence >= 0.65, `L1 did not learn east→north transition (${JSON.stringify(l1EastNorth)}).`);
    assert(l2EastSouth?.successes >= 2 && l2EastSouth.confidence >= 0.65, `L2 did not learn east→south transition (${JSON.stringify(l2EastSouth)}).`);
    assert(!trained.l1Plan.transitions['food:there:0>food:there:6'], 'L1 learned L2 private second-step plan.');
    assert(!trained.l2Plan.transitions['food:there:0>food:there:2'], 'L2 learned L1 private second-step plan.');

    await emitEast(9);
    const pending = await advanceUntil(
      read,
      state => Boolean(
        state.l1Plan?.pendingPlan?.predictedProposalKey === 'food:there:2' &&
        state.l2Plan?.pendingPlan?.predictedProposalKey === 'food:there:6'
      ),
      'Private prospective plans after replaying only first step',
      3
    );
    fs.writeFileSync(path.join(artifactDir, 'distributed-planning-v67-pending.json'), JSON.stringify({ setup, pending, pageErrors }, null, 2));

    assert(pending.l1Plan.pendingPlan.predictedDirection.y > 0.9, 'L1 prospective plan did not predict north.');
    assert(pending.l2Plan.pendingPlan.predictedDirection.y < -0.9, 'L2 prospective plan did not predict south.');

    await page.evaluate(ticks => window.realitySandboxDebug.advance(ticks), STEP_TICKS);
    const applied = await read();
    fs.writeFileSync(path.join(artifactDir, 'distributed-planning-v67-applied.json'), JSON.stringify({ setup, applied, pageErrors }, null, 2));

    assert(applied.l1Plan.pendingPlan === null && applied.l2Plan.pendingPlan === null, 'Private prospective plans did not resolve after one bounded future step.');
    assert(applied.l1Plan.lastPlanApplication?.applied && applied.l1Plan.lastPlanApplication.direction.y > 0.9, 'L1 did not autonomously apply learned north second step.');
    assert(applied.l2Plan.lastPlanApplication?.applied && applied.l2Plan.lastPlanApplication.direction.y < -0.9, 'L2 did not autonomously apply learned south second step.');
    assert(applied.l1Plan.lastPlanApplication.directionalVelocityDelta > 0, 'L1 planned second step made no positive directional physical contribution.');
    assert(applied.l2Plan.lastPlanApplication.directionalVelocityDelta > 0, 'L2 planned second step made no positive directional physical contribution.');

    const raw = await page.evaluate(({ listener1Id, listener2Id }) => {
      const c = window.realitySandboxPlanet.world.ecs.components;
      return [listener1Id, listener2Id].map(id => ({ id, state:{ ...c.motile.get(id).bioV67 } }));
    }, setup);
    for (const item of raw) {
      for (const forbidden of ['sharedPlan','groupPlan','groupGoal','planner','plannerId','leader','leaderId','authority','authorityId','routeAuthority','taskAssignment','members','membership']) {
        assert(!(forbidden in item.state), `Organism ${item.id} stores forbidden v67 shared-plan/authority field ${forbidden}.`);
      }
    }

    const flags = applied.stats;
    assert(flags.version === 'v67a-private-transition-planning', 'Wrong v67 runtime version.');
    assert(flags.learnsOnlyFromOwnV66DecisionSequence && flags.transitionEvidenceRequiresOwnPhysicalProgress, 'v67 own-sequence/physical-evidence contract failed.');
    assert(flags.plansStoredPerOrganismOnly && flags.plansPredictOneBoundedFutureStep && flags.freshPublicDecisionRevisesPendingPlan, 'v67 bounded private planning contract failed.');
    assert(flags.noOtherOrganismPlanInspection && flags.noSharedPlanMemory && flags.noCentralPlannerOrGroupGoal && flags.noRouteAuthorityOrTaskAssignment, 'v67 no-central/shared-plan contract failed.');
    assert(flags.privatePlansCanDivergeUnderIdenticalGenomes && flags.prospectiveActionCanOccurWithoutSecondPublicSignal && flags.detectedDangerOverridesPlan, 'v67 emergent prospective-action contract failed.');
    assert(flags.authoritativeFixedStep && flags.noHardPopulationCap && flags.noHardDisplayCap && !flags.surfaceRendererEnabled, 'v67 fixed-step/cap/renderer contract failed.');
    assert(applied.dataset === 'private-prospective-plans', 'v67 dataset marker is not active.');
    assert(applied.build === 'evolution-v67-distributed-multistep-planning', 'v67 build marker is not active.');
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);
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
