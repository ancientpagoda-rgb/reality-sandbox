const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_COUNTERFACTUAL_BRANCH_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'counterfactual-branch-v68-smoke');
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
      window.realitySandboxDistributedPlanningV67?.installed &&
      window.realitySandboxCounterfactualBranchSelectionV68?.installed
    ), null, { timeout:120000 });

    const setup = await page.evaluate(() => {
      const planet = window.realitySandboxPlanet;
      const c = planet.world.ecs.components;
      for (const id of [...c.motile.keys()]) planet.world.ecs.destroyEntity(id);
      for (const [, res] of c.resource.entries()) res.amount = 0;
      for (const [, det] of c.detritus.entries()) det.amount = 0;

      const lineageId = 'v68-test-lineage';
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
          syntaxOrder:'referent-modifier', syntaxConfidence:0.90,
          inventionCounter:0, observedPairMask:0,
          lastPhrase:null, lastHeardPhrase:null, interpretedComposition:null, appliedComposition:null,
        };
      }

      function baseV57() {
        return {
          socialInference:0.75, partnerMemory:0.75, attentionSelectivity:0.75,
          models:{}, preferredPartnerId:null, preferredPartnerScore:0,
          lastReceivedStep:-1, lastCapturedActStep:-1,
          pendingAudienceEvidence:null, pendingSpeakerEvidence:null, lastSocialGuidance:null,
        };
      }

      function responseRole() {
        return {
          roleLearning:0.70, complementaritySensitivity:0.70, persistencePlasticity:0.70,
          initiativeTendency:-0.65, roleEvidence:4, initiations:0, responses:4,
          lastInitiationKey:null, lastResponseKey:'v68-response-history',
          lastRoleUpdate:null, lastComplementarityAdjustment:null, lastCommitmentAdjustment:null,
        };
      }

      function model(id) {
        return {
          id, trust:0.82, responsiveness:0, familiarity:0.74,
          knowledge:{ food:0, danger:0, prey:0 },
          observations:4, successfulResponses:0, failedResponses:0,
          reliableClaims:4, unreliableClaims:0, lastSeenStep:0, lastInteractionStep:0,
        };
      }

      function add(px, py) {
        const id = planet.world.ecs.createEntity();
        c.position.set(id, { x:(px + planet.world.width) % planet.world.width, y:py });
        c.velocity.set(id, { vx:0, vy:0 });
        c.motile.set(id, {
          lineageId, generation:12, plantAncestorId:null, energy:1.25, age:30,
          state:'awake', sleepDebt:0.02, decisionCooldown:999, neurotoxinLoad:0,
          genome:{ ...genome },
          bioV50:{ mode:'rest', drives:{ rest:1 }, hunger:0, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null },
          bioV51:null, bioV52:null, bioV53:null, bioV54:null, bioV55:knownV55(),
          bioV56:baseV56(), bioV57:baseV57(), bioV58:null, bioV59:null, bioV60:null,
          bioV61:null, bioV62:null, bioV63:null, bioV64:null, bioV65:null, bioV66:null, bioV67:null, bioV68:null,
        });
        return id;
      }

      const eastId = add(x - 80, y - 65);
      const northId = add(x, y - 90);
      const southId = add(x + 80, y - 65);
      const listener1Id = add(x - 35, y + 55);
      const listener2Id = add(x + 35, y + 55);

      for (const listenerId of [listener1Id, listener2Id]) {
        const listener = c.motile.get(listenerId);
        listener.bioV64 = responseRole();
        listener.bioV57.models[String(eastId)] = model(eastId);
        listener.bioV57.models[String(northId)] = model(northId);
        listener.bioV57.models[String(southId)] = model(southId);
      }

      return { eastId, northId, southId, listener1Id, listener2Id, lineageId };
    });

    const read = () => page.evaluate(({ listener1Id, listener2Id }) => ({
      l1Decision:window.realitySandboxDistributedConsensusV66.getDecision(listener1Id),
      l2Decision:window.realitySandboxDistributedConsensusV66.getDecision(listener2Id),
      l1Plan:window.realitySandboxDistributedPlanningV67.getPlan(listener1Id),
      l2Plan:window.realitySandboxDistributedPlanningV67.getPlan(listener2Id),
      l1Counterfactual:window.realitySandboxCounterfactualBranchSelectionV68.getCounterfactualState(listener1Id),
      l2Counterfactual:window.realitySandboxCounterfactualBranchSelectionV68.getCounterfactualState(listener2Id),
      stats:window.realitySandboxCounterfactualBranchSelectionV68.getStats(),
      build:window.realitySandboxEvolutionBuild,
      dataset:document.documentElement.dataset.counterfactualBranchSelectionV68,
    }), setup);

    async function emitEast(round) {
      await page.evaluate(({ setup, round }) => {
        const c = window.realitySandboxPlanet.world.ecs.components;
        c.velocity.set(setup.listener1Id, { vx:-5.5, vy:0 });
        c.velocity.set(setup.listener2Id, { vx:-5.5, vy:0 });
        c.motile.get(setup.eastId).bioV56.lastIntentionalAct = {
          audienceId:-1, tokens:['ka','ra'], gesture:{ x:1, y:0 },
          pairKey:'hidden:wrong', utility:-1, willingness:0,
          step:4000 + round * 10 + 1,
        };
      }, { setup, round });
      return advanceUntil(
        read,
        state => state.l1Decision?.lastLocalDecision?.sector === 0 && state.l2Decision?.lastLocalDecision?.sector === 0,
        `Round ${round} east source decision`,
        4
      );
    }

    async function emitSecond(round, which) {
      await page.evaluate(({ setup, round, which }) => {
        const c = window.realitySandboxPlanet.world.ecs.components;
        // Same world event, opposite private physical payoff because the listeners
        // enter it with opposite directional momentum.
        c.velocity.set(setup.listener1Id, { vx:0, vy:-7.5 });
        c.velocity.set(setup.listener2Id, { vx:0, vy:7.5 });
        const speakerId = which === 'north' ? setup.northId : setup.southId;
        c.motile.get(speakerId).bioV56.lastIntentionalAct = {
          audienceId:-1, tokens:['ka','ra'], gesture:which === 'north' ? { x:0, y:1 } : { x:0, y:-1 },
          pairKey:'hidden:wrong', utility:which === 'north' ? -1 : 1, willingness:which === 'north' ? 0 : 1,
          step:4000 + round * 10 + (which === 'north' ? 2 : 3),
        };
      }, { setup, round, which });
      const sector = which === 'north' ? 2 : 6;
      return advanceUntil(
        read,
        state => state.l1Decision?.lastLocalDecision?.sector === sector && state.l2Decision?.lastLocalDecision?.sector === sector,
        `Round ${round} ${which} branch decision`,
        4
      );
    }

    const sequence = ['north','south','north','south'];
    for (let i = 0; i < sequence.length; i++) {
      const round = i + 1;
      await emitEast(round);
      await emitSecond(round, sequence[i]);
    }

    const trained = await read();
    fs.writeFileSync(path.join(artifactDir, 'counterfactual-v68-trained.json'), JSON.stringify({ setup, trained, pageErrors }, null, 2));

    const l1North = trained.l1Counterfactual.transitionValues['food:there:0>food:there:2'];
    const l1South = trained.l1Counterfactual.transitionValues['food:there:0>food:there:6'];
    const l2North = trained.l2Counterfactual.transitionValues['food:there:0>food:there:2'];
    const l2South = trained.l2Counterfactual.transitionValues['food:there:0>food:there:6'];
    assert(l1North?.samples >= 2 && l1South?.samples >= 2 && l2North?.samples >= 2 && l2South?.samples >= 2, 'Both listeners did not experience both counterfactual branches at least twice.');
    assert(l1North.meanPhysicalProgress > l1South.meanPhysicalProgress + 0.12, `L1 did not privately value north over south (${l1North.meanPhysicalProgress} vs ${l1South.meanPhysicalProgress}).`);
    assert(l2South.meanPhysicalProgress > l2North.meanPhysicalProgress + 0.12, `L2 did not privately value south over north (${l2South.meanPhysicalProgress} vs ${l2North.meanPhysicalProgress}).`);

    const l1V67North = trained.l1Plan.transitions['food:there:0>food:there:2'];
    const l1V67South = trained.l1Plan.transitions['food:there:0>food:there:6'];
    const l2V67North = trained.l2Plan.transitions['food:there:0>food:there:2'];
    const l2V67South = trained.l2Plan.transitions['food:there:0>food:there:6'];
    for (const record of [l1V67North,l1V67South,l2V67North,l2V67South]) {
      assert(record?.successes >= 2 && record.confidence >= 0.65, `A v67 branch was not independently eligible (${JSON.stringify(record)}).`);
    }

    const priorL1Application = trained.l1Plan.lastPlanApplication?.step ?? -1;
    const priorL2Application = trained.l2Plan.lastPlanApplication?.step ?? -1;
    const replay = await emitEast(9);
    fs.writeFileSync(path.join(artifactDir, 'counterfactual-v68-replay.json'), JSON.stringify({ setup, replay, pageErrors }, null, 2));

    assert(replay.l1Counterfactual.lastCounterfactualChoice?.chosenProposalKey === 'food:there:2', `L1 did not privately choose north (${JSON.stringify(replay.l1Counterfactual.lastCounterfactualChoice)}).`);
    assert(replay.l2Counterfactual.lastCounterfactualChoice?.chosenProposalKey === 'food:there:6', `L2 did not privately choose south (${JSON.stringify(replay.l2Counterfactual.lastCounterfactualChoice)}).`);
    assert(replay.l1Counterfactual.lastCounterfactualChoice.valueMargin >= 0.12 && replay.l2Counterfactual.lastCounterfactualChoice.valueMargin >= 0.12, 'Counterfactual choice did not clear the private value-margin threshold.');
    assert(replay.l1Plan.lastFormedPlan?.predictedProposalKey === 'food:there:2', 'L1 v67 pending forecast does not reflect its v68 private branch choice.');
    assert(replay.l2Plan.lastFormedPlan?.predictedProposalKey === 'food:there:6', 'L2 v67 pending forecast was not privately revised to south by v68.');

    const privateExecutionComplete = state => Boolean(
      state.l1Plan?.lastPlanApplication?.applied &&
      state.l1Plan.lastPlanApplication.predictedProposalKey === 'food:there:2' &&
      state.l1Plan.lastPlanApplication.step > priorL1Application &&
      state.l2Plan?.lastPlanApplication?.applied &&
      state.l2Plan.lastPlanApplication.predictedProposalKey === 'food:there:6' &&
      state.l2Plan.lastPlanApplication.step > priorL2Application
    );
    let applied = replay;
    if (!privateExecutionComplete(applied)) applied = await advanceUntil(read, privateExecutionComplete, 'Counterfactual branch execution', 2);
    fs.writeFileSync(path.join(artifactDir, 'counterfactual-v68-applied.json'), JSON.stringify({ setup, applied, pageErrors }, null, 2));

    assert(applied.l1Plan.lastPlanApplication.direction.y > 0.9 && applied.l1Plan.lastPlanApplication.directionalVelocityDelta > 0, 'L1 did not physically execute its privately preferred north branch.');
    assert(applied.l2Plan.lastPlanApplication.direction.y < -0.9 && applied.l2Plan.lastPlanApplication.directionalVelocityDelta > 0, 'L2 did not physically execute its privately preferred south branch.');

    const raw = await page.evaluate(({ listener1Id, listener2Id }) => {
      const c = window.realitySandboxPlanet.world.ecs.components;
      return [listener1Id, listener2Id].map(id => ({ id, state:{ ...c.motile.get(id).bioV68 } }));
    }, setup);
    for (const item of raw) {
      for (const forbidden of ['sharedValues','sharedUtility','utilityTable','groupObjective','objectiveFunction','centralObjective','groupPlanRanking','planner','leader','authority','members','membership']) {
        assert(!(forbidden in item.state), `Organism ${item.id} stores forbidden v68 shared-value/central-objective field ${forbidden}.`);
      }
    }

    const flags = applied.stats;
    assert(flags.version === 'v68a-private-counterfactual-branch-selection', 'Wrong v68 runtime version.');
    assert(flags.valuesLearnedFromOwnV66PhysicalOutcomesOnly && flags.comparesOnlyOwnV67EligibleTransitions, 'v68 own-outcome/eligible-transition contract failed.');
    assert(flags.counterfactualChoiceRequiresMultipleExperiencedAlternatives && flags.privatePendingPlanRevisionOnly, 'v68 counterfactual comparison contract failed.');
    assert(flags.noOtherOrganismValueInspection && flags.noSharedUtilityTable && flags.noCentralObjectiveFunction && flags.noGroupPlanRanking, 'v68 privacy/no-central-objective contract failed.');
    assert(flags.identicalTransitionKnowledgeCanYieldDifferentPrivateChoices && flags.branchPreferenceCanChangeWithOwnOutcomeEvidence, 'v68 private divergence/adaptivity contract failed.');
    assert(flags.maxValueRecords === 12 && flags.minValueSamples === 2 && flags.minBranchValueMargin === 0.12, 'v68 value-memory constants changed.');
    assert(flags.authoritativeFixedStep && flags.noHardPopulationCap && flags.noHardDisplayCap && !flags.surfaceRendererEnabled, 'v68 fixed-step/cap/renderer contract failed.');
    assert(applied.dataset === 'private-outcome-ranked-alternatives', 'v68 dataset marker is not active.');
    assert(applied.build === 'evolution-v68-private-counterfactual-branch-selection', 'v68 build marker is not active.');
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
