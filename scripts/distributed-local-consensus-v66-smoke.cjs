const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_DISTRIBUTED_CONSENSUS_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'distributed-consensus-v66-smoke');
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
      window.realitySandboxCompositionalLanguageV55?.installed &&
      window.realitySandboxCommunicativeIntentV56?.installed &&
      window.realitySandboxSituationalInfluenceV65?.installed &&
      window.realitySandboxDistributedConsensusV66?.installed
    ), null, { timeout:120000 });

    const setup = await page.evaluate(() => {
      const planet = window.realitySandboxPlanet;
      const c = planet.world.ecs.components;
      for (const id of [...c.motile.keys()]) planet.world.ecs.destroyEntity(id);
      for (const [, res] of c.resource.entries()) res.amount = 0;
      for (const [, det] of c.detritus.entries()) det.amount = 0;

      const lineageId = 'v66-test-lineage';
      const y = planet.world.height * 0.52;
      const x = planet.world.width * 0.44;
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
          lastResponseKey:'v66-response-history',
          lastRoleUpdate:null,
          lastComplementarityAdjustment:null,
          lastCommitmentAdjustment:null,
        };
      }

      function add(px, py = y) {
        const id = planet.world.ecs.createEntity();
        c.position.set(id, { x:(px + planet.world.width) % planet.world.width, y:py });
        c.velocity.set(id, { vx:0, vy:0 });
        c.motile.set(id, {
          lineageId, generation:10, plantAncestorId:null, energy:1.2, age:26,
          state:'awake', sleepDebt:0.05, decisionCooldown:999, neurotoxinLoad:0,
          genome:{ ...genome },
          bioV50:{ mode:'rest', drives:{ rest:1 }, hunger:0, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null },
          bioV51:null, bioV52:null, bioV53:null, bioV54:null, bioV55:knownV55(),
          bioV56:baseV56(), bioV57:baseV57(), bioV58:null, bioV59:null, bioV60:null,
          bioV61:null, bioV62:null, bioV63:null, bioV64:null, bioV65:null, bioV66:null,
        });
        return id;
      }

      const speakerAId = add(x - 52, y - 28);
      const speakerBId = add(x + 52, y - 28);
      const listener1Id = add(x - 46, y + 54);
      const listener2Id = add(x, y + 66);
      const listener3Id = add(x + 46, y + 54);

      for (const id of [listener1Id, listener2Id, listener3Id]) c.motile.get(id).bioV64 = responseRole();

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
      const l3 = c.motile.get(listener3Id);
      for (const listener of [l1, l2]) {
        listener.bioV57.models[String(speakerAId)] = model(speakerAId, 0.80, 3, 0);
        listener.bioV57.models[String(speakerBId)] = model(speakerBId, -0.70, 0, 3);
      }
      l3.bioV57.models[String(speakerAId)] = model(speakerAId, -0.70, 0, 3);
      l3.bioV57.models[String(speakerBId)] = model(speakerBId, 0.80, 3, 0);

      function emitRound(round) {
        const a = c.motile.get(speakerAId);
        const b = c.motile.get(speakerBId);
        a.bioV56.lastIntentionalAct = {
          audienceId:-1,
          tokens:['ka','ra'],
          gesture:{ x:1, y:0 },
          pairKey:'danger:avoid',
          utility:-0.99,
          willingness:0.01,
          step:1000 + round * 10 + 1,
        };
        b.bioV56.lastIntentionalAct = {
          audienceId:-1,
          tokens:['ka','ra'],
          gesture:{ x:-1, y:0 },
          pairKey:'prey:together',
          utility:0.99,
          willingness:0.99,
          step:1000 + round * 10 + 2,
        };
      }
      emitRound(1);

      return { speakerAId, speakerBId, listener1Id, listener2Id, listener3Id, lineageId };
    });

    const read = () => page.evaluate(({ listener1Id, listener2Id, listener3Id }) => ({
      l1:window.realitySandboxDistributedConsensusV66.getDecision(listener1Id),
      l2:window.realitySandboxDistributedConsensusV66.getDecision(listener2Id),
      l3:window.realitySandboxDistributedConsensusV66.getDecision(listener3Id),
      field:window.realitySandboxDistributedConsensusV66.getDecisionField(),
      stats:window.realitySandboxDistributedConsensusV66.getStats(),
      build:window.realitySandboxEvolutionBuild,
      dataset:document.documentElement.dataset.distributedConsensusV66,
      influences:{
        l1A:window.realitySandboxSituationalInfluenceV65.getInfluence(listener1Id, window.__v66setup?.speakerAId || 0),
      },
    }), setup);

    await page.evaluate(setup => { window.__v66setup = setup; }, setup);

    const initial = await advanceUntil(
      read,
      state => Boolean(state.l1?.lastLocalDecision && state.l2?.lastLocalDecision && state.l3?.lastLocalDecision),
      'Initial distributed local decisions',
      4
    );
    fs.writeFileSync(path.join(artifactDir, 'distributed-consensus-v66-initial.json'), JSON.stringify({ setup, initial, pageErrors }, null, 2));

    assert(initial.l1.lastLocalDecision.referent === 'food' && initial.l1.lastLocalDecision.modifier === 'there', 'L1 did not decode public tokens through its own v55 semantics.');
    assert(initial.l2.lastLocalDecision.sector === initial.l1.lastLocalDecision.sector, 'L1 and L2 did not independently align on A direction.');
    assert(initial.l3.lastLocalDecision.sector !== initial.l1.lastLocalDecision.sector, 'L3 did not preserve its independently preferred B direction.');
    assert(initial.l1.lastAppliedDecision?.directionalVelocityDelta > 0, 'L1 did not receive a positive v66 physical steering contribution.');
    assert(initial.l2.lastAppliedDecision?.directionalVelocityDelta > 0, 'L2 did not receive a positive v66 physical steering contribution.');
    assert(initial.l3.lastAppliedDecision?.directionalVelocityDelta > 0, 'L3 did not receive a positive v66 physical steering contribution.');

    const initialLineage = initial.field.lineages.find(item => item.lineageId === setup.lineageId);
    assert(initialLineage?.proposals?.[0]?.observers === 2, `Initial derived field did not contain a 2-observer local alignment (${JSON.stringify(initialLineage)}).`);
    assert(initialLineage?.proposals?.[1]?.observers === 1, 'Initial derived field did not preserve the dissenting 1-observer proposal.');

    const rawInitial = await page.evaluate(({ listener1Id, listener2Id, listener3Id }) => {
      const c = window.realitySandboxPlanet.world.ecs.components;
      return [listener1Id, listener2Id, listener3Id].map(id => ({ id, state:{ ...c.motile.get(id).bioV66 } }));
    }, setup);
    for (const item of rawInitial) {
      for (const forbidden of ['leader','leaderId','government','authority','authorityId','voteLedger','votes','groupDecision','consensusId','members','membership']) {
        assert(!(forbidden in item.state), `Organism ${item.id} stores forbidden v66 governance/group-decision field ${forbidden}.`);
      }
    }

    await page.evaluate(({ setup }) => {
      const c = window.realitySandboxPlanet.world.ecs.components;
      const l2 = c.motile.get(setup.listener2Id);
      const a = l2.bioV57.models[String(setup.speakerAId)];
      const b = l2.bioV57.models[String(setup.speakerBId)];
      a.trust = -0.78; a.reliableClaims = 0; a.unreliableClaims = 4; a.observations = 4;
      b.trust = 0.84; b.reliableClaims = 4; b.unreliableClaims = 0; b.observations = 4;

      c.motile.get(setup.speakerAId).bioV56.lastIntentionalAct = {
        audienceId:-1, tokens:['ka','ra'], gesture:{ x:1, y:0 }, pairKey:'danger:avoid', utility:1, willingness:1, step:1021,
      };
      c.motile.get(setup.speakerBId).bioV56.lastIntentionalAct = {
        audienceId:-1, tokens:['ka','ra'], gesture:{ x:-1, y:0 }, pairKey:'prey:together', utility:-1, willingness:0, step:1022,
      };
    }, { setup });

    const flipped = await advanceUntil(
      read,
      state => Boolean(
        state.l1?.lastLocalDecision && state.l2?.lastLocalDecision && state.l3?.lastLocalDecision &&
        state.l2.lastLocalDecision.sector === state.l3.lastLocalDecision.sector &&
        state.l2.lastLocalDecision.sector !== state.l1.lastLocalDecision.sector
      ),
      'Private-history-driven local alignment flip',
      4
    );
    fs.writeFileSync(path.join(artifactDir, 'distributed-consensus-v66-flipped.json'), JSON.stringify({ setup, flipped, pageErrors }, null, 2));

    const flippedLineage = flipped.field.lineages.find(item => item.lineageId === setup.lineageId);
    assert(flippedLineage?.proposals?.[0]?.observers === 2, `Flipped derived field did not contain a 2-observer B alignment (${JSON.stringify(flippedLineage)}).`);
    assert(flippedLineage?.proposals?.[1]?.observers === 1, 'Flipped field did not preserve L1 as independent dissent.');
    assert(flipped.l2.lastAppliedDecision?.directionalVelocityDelta > 0, 'L2 did not physically turn toward its new privately preferred proposal.');
    assert(flipped.l1.lastLocalDecision.sector === initial.l1.lastLocalDecision.sector, 'Changing only L2 history improperly moved L1 decision.');
    assert(flipped.l3.lastLocalDecision.sector === initial.l3.lastLocalDecision.sector, 'Changing only L2 history improperly moved L3 decision.');

    const flags = flipped.stats;
    assert(flags.version === 'v66a-distributed-local-consensus', 'Wrong v66 runtime version.');
    assert(flags.usesPublicV56TokensAndGesturesOnly && flags.listenerDecodesOwnV55Semantics, 'v66 public-signal/listener-decoding contract failed.');
    assert(flags.speakerPairUtilityAndWillingnessIgnored && flags.privateWeightFromOwnV65InfluenceOnly, 'v66 hidden-speaker-metadata/privacy contract failed.');
    assert(flags.physicallyLocalProposalCompetition && flags.compatibleSignalsAggregateLocally && flags.decisionRequiresSupportAndMargin, 'v66 local proposal competition contract failed.');
    assert(flags.decisionsStoredPerOrganismOnly && flags.aggregateConsensusDerivedOnDemand, 'v66 distributed-state contract failed.');
    assert(flags.noGlobalVoteLedger && flags.noGovernmentAuthorityOrLeaderObject && flags.noStoredGroupDecision, 'v66 no-governance/no-global-decision contract failed.');
    assert(flags.consensusCanSplitAndReform && flags.physicalSteeringContribution && flags.detectedDangerOverridesConsensus, 'v66 reversible physical coordination contract failed.');
    assert(flags.spatialHashing && flags.authoritativeFixedStep && flags.noHardPopulationCap && flags.noHardDisplayCap && !flags.surfaceRendererEnabled, 'v66 performance/fixed-step contract failed.');
    assert(flipped.dataset === 'private-local-decisions', 'v66 dataset marker is not active.');
    assert(flipped.build === 'evolution-v66-distributed-local-consensus', 'v66 build marker is not active.');
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
