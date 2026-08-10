const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_COALITION_JOINT_ACTION_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'coalition-joint-action-v63-smoke');
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

  try {
    await page.goto(baseUrl, { waitUntil:'domcontentloaded', timeout:120000 });
    await page.waitForFunction(() => Boolean(
      window.realitySandboxDebug?.ready &&
      window.realitySandboxCommunicativeIntentV56?.installed &&
      window.realitySandboxProtoCoalitionsV62?.installed &&
      window.realitySandboxCoalitionJointActionV63?.installed
    ), null, { timeout:120000 });

    const setup = await page.evaluate(() => {
      const planet = window.realitySandboxPlanet;
      const c = planet.world.ecs.components;
      for (const id of [...c.motile.keys()]) planet.world.ecs.destroyEntity(id);
      for (const [, res] of c.resource.entries()) res.amount = 0;
      for (const [, det] of c.detritus.entries()) det.amount = 0;

      const lineageId = 'v63-test-lineage';
      const base = { x:planet.world.width * 0.46, y:planet.world.height * 0.54 };
      const genome = {
        photosynthesis:0, heterotrophy:0.08, motility:0.45, sense:0.82, brainSpeed:1,
        sociality:0.9, dormancy:0.4, toxin:0, neurotoxin:0, scavenging:0,
        aggression:0, armor:0.2, seedInvestment:0.2, metabolism:0.01, bodySize:0.5,
      };

      function baseV56() {
        return {
          audienceAwareness:1,
          feedbackLearning:1,
          pointingControl:1,
          utilities:{},
          trials:{},
          pendingAct:null,
          lastChoice:null,
          lastIntentionalAct:null,
          lastReceivedAct:null,
          lastJointAttention:null,
          attendedSpeakerId:null,
        };
      }

      function baseV62() {
        return {
          affiliationLearning:1,
          loyalty:1,
          partnerSelectivity:1,
          affiliations:{},
          preferredAffiliateId:null,
          preferredAffiliateScore:0,
          lastAudienceAdjustment:null,
        };
      }

      function add(x) {
        const id = planet.world.ecs.createEntity();
        c.position.set(id, { x:(x + planet.world.width) % planet.world.width, y:base.y });
        c.velocity.set(id, { vx:0, vy:0 });
        c.motile.set(id, {
          lineageId, generation:7, plantAncestorId:null, energy:1.1, age:20,
          state:'awake', sleepDebt:0.05, decisionCooldown:999, neurotoxinLoad:0,
          genome:{ ...genome },
          bioV50:{ mode:'rest', drives:{ rest:1 }, hunger:0, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null },
          bioV51:null, bioV52:null, bioV53:null, bioV54:null, bioV55:null,
          bioV56:baseV56(), bioV57:null, bioV58:null, bioV59:null, bioV60:null, bioV61:null,
          bioV62:baseV62(), bioV63:null,
        });
        return id;
      }

      const speakerId = add(base.x);
      const affiliateId = add(base.x + 88);
      const neutralId = add(base.x - 88);

      const affiliate = c.motile.get(affiliateId);
      affiliate.bioV62.affiliations[String(speakerId)] = {
        partnerId:speakerId,
        affinity:0.82,
        evidenceStrength:0.78,
        directAidEvidence:0.80,
        communicationEvidence:0,
        witnessedProsocialEvidence:0,
        sourceMask:1,
        lastEvidenceStep:0,
        updatedAtStep:0,
      };
      affiliate.bioV62.preferredAffiliateId = speakerId;
      affiliate.bioV62.preferredAffiliateScore = 0.82;

      // Deliberately no reverse speaker→affiliate affinity. v63 must not require
      // hidden knowledge that the relationship is mutual.
      return { speakerId, affiliateId, neutralId, lineageId, base };
    });

    const reverseBefore = await page.evaluate(({ speakerId, affiliateId }) => ({
      speaker:window.realitySandboxProtoCoalitionsV62.getAffiliation(speakerId),
      affiliate:window.realitySandboxProtoCoalitionsV62.getAffiliation(affiliateId),
    }), setup);
    assert(!reverseBefore.speaker?.affiliations?.[String(setup.affiliateId)], 'Speaker unexpectedly had reverse private affiliation to the listener.');
    assert(reverseBefore.affiliate?.affiliations?.[String(setup.speakerId)]?.affinity > 0.8, 'Affiliate listener fixture lacks strong own affiliation.');

    await page.evaluate(({ setup }) => {
      const c = window.realitySandboxPlanet.world.ecs.components;
      const affiliate = c.motile.get(setup.affiliateId);
      affiliate.bioV56.lastJointAttention = {
        speakerId:setup.speakerId,
        referent:'food',
        modifier:'there',
        gesture:{ x:1, y:0 },
        steeringDirection:{ x:1, y:0 },
        strength:0.95,
        step:101,
      };
      c.velocity.set(setup.affiliateId, { vx:0, vy:0 });
    }, { setup });

    await page.evaluate(ticks => window.realitySandboxDebug.advance(ticks), STEP_TICKS);
    const affiliateStarted = await page.evaluate(({ affiliateId }) => ({
      joint:window.realitySandboxCoalitionJointActionV63.getJointAction(affiliateId),
      velocity:{ ...window.realitySandboxPlanet.world.ecs.components.velocity.get(affiliateId) },
      stats:window.realitySandboxCoalitionJointActionV63.getStats(),
    }), setup);

    assert(affiliateStarted.joint?.commitment, 'Strong own affiliation did not start a v63 commitment.');
    assert(affiliateStarted.joint.commitment.speakerId === setup.speakerId, 'v63 commitment targets the wrong public speaker.');
    assert(affiliateStarted.joint.commitment.remainingSteps >= 1 && affiliateStarted.joint.commitment.totalSteps <= 6, 'v63 commitment duration is invalid or unbounded.');
    assert(affiliateStarted.velocity.vx > 0, 'Affiliate commitment did not steer in the observable joint-attention direction.');
    assert(!('targetX' in affiliateStarted.joint.commitment) && !('targetY' in affiliateStarted.joint.commitment) && !('target' in affiliateStarted.joint.commitment), 'v63 commitment contains hidden target coordinates.');

    await page.evaluate(({ affiliateId }) => {
      const organism = window.realitySandboxPlanet.world.ecs.components.motile.get(affiliateId);
      organism.bioV56.lastJointAttention = null;
    }, { affiliateId:setup.affiliateId });
    const beforePersistVx = affiliateStarted.velocity.vx;
    await page.evaluate(ticks => window.realitySandboxDebug.advance(ticks), STEP_TICKS * 2);
    const affiliatePersisted = await page.evaluate(({ affiliateId }) => ({
      joint:window.realitySandboxCoalitionJointActionV63.getJointAction(affiliateId),
      velocity:{ ...window.realitySandboxPlanet.world.ecs.components.velocity.get(affiliateId) },
      stats:window.realitySandboxCoalitionJointActionV63.getStats(),
    }), setup);
    assert(affiliatePersisted.joint?.lastAppliedCommitment?.speakerId === setup.speakerId, 'Affiliate commitment was not applied after the public signal disappeared.');
    assert(affiliatePersisted.velocity.vx > beforePersistVx, 'Affiliate response did not persist physically beyond the original joint-attention event.');
    assert(affiliatePersisted.stats.commitmentsApplied >= 2, 'v63 counted no sustained multi-cadence response.');

    await page.evaluate(({ setup }) => {
      const c = window.realitySandboxPlanet.world.ecs.components;
      const neutral = c.motile.get(setup.neutralId);
      neutral.bioV56.lastJointAttention = {
        speakerId:setup.speakerId,
        referent:'food',
        modifier:'there',
        gesture:{ x:1, y:0 },
        steeringDirection:{ x:1, y:0 },
        strength:0.95,
        step:202,
      };
      c.velocity.set(setup.neutralId, { vx:0, vy:0 });
    }, { setup });

    await page.evaluate(ticks => window.realitySandboxDebug.advance(ticks), STEP_TICKS);
    const neutral = await page.evaluate(({ neutralId }) => ({
      joint:window.realitySandboxCoalitionJointActionV63.getJointAction(neutralId),
      velocity:{ ...window.realitySandboxPlanet.world.ecs.components.velocity.get(neutralId) },
      stats:window.realitySandboxCoalitionJointActionV63.getStats(),
    }), setup);
    assert(!neutral.joint?.commitment, 'Neutral listener received a v63 commitment without sufficient own affiliation.');
    assert(Math.abs(neutral.velocity.vx) < 1e-9 && Math.abs(neutral.velocity.vy) < 1e-9, 'v63 changed neutral listener motion instead of preserving upstream v56 behavior.');
    assert(neutral.stats.weakAffiliationPassThroughs >= 1, 'Weak-affiliation pass-through was not counted.');

    await page.evaluate(({ setup }) => {
      const c = window.realitySandboxPlanet.world.ecs.components;
      const affiliate = c.motile.get(setup.affiliateId);
      affiliate.bioV50.detectedDanger = { id:'local-danger', x:setup.base.x - 10, y:setup.base.y, strength:1 };
      affiliate.bioV56.lastJointAttention = {
        speakerId:setup.speakerId,
        referent:'food',
        modifier:'there',
        gesture:{ x:1, y:0 },
        steeringDirection:{ x:1, y:0 },
        strength:0.95,
        step:303,
      };
    }, { setup });

    await page.evaluate(ticks => window.realitySandboxDebug.advance(ticks), STEP_TICKS);
    const interrupted = await page.evaluate(({ affiliateId }) => ({
      joint:window.realitySandboxCoalitionJointActionV63.getJointAction(affiliateId),
      stats:window.realitySandboxCoalitionJointActionV63.getStats(),
      build:window.realitySandboxEvolutionBuild,
      dataset:document.documentElement.dataset.coalitionJointActionV63,
    }), setup);
    assert(!interrupted.joint?.commitment, 'Urgent local danger did not cancel coalition-conditioned commitment.');
    assert(interrupted.joint?.lastAppliedCommitment?.interrupted === true, 'v63 did not record urgent local override.');
    assert(interrupted.stats.commitmentsInterruptedByUrgentNeed >= 1, 'Urgent local override was not counted.');

    const flags = interrupted.stats;
    assert(flags.version === 'v63a-affiliation-conditioned-joint-action', 'Wrong v63 runtime version.');
    assert(flags.usesObservableV56JointAttentionOnly && flags.usesOwnV62AffiliationOnly, 'v63 observable-input/own-affiliation contract failed.');
    assert(flags.noReverseAffiliationInspection && flags.noCoalitionMembershipLookup && flags.noHiddenTargetCoordinates, 'v63 privacy/no-membership contract failed.');
    assert(flags.sustainedResponseAfterPublicSignal && flags.weakAffiliationPreservesV56Behavior && flags.urgentLocalNeedsOverrideCommitment, 'v63 behavior-composition contract failed.');
    assert(flags.oneBoundedCommitmentPerOrganism && flags.maxCommitmentSteps === 6, 'v63 commitment bound failed.');
    assert(flags.authoritativeFixedStep && flags.noHardPopulationCap && flags.noHardDisplayCap && !flags.surfaceRendererEnabled, 'v63 fixed-step/cap/renderer contract failed.');
    assert(interrupted.build === 'evolution-v63-coalition-joint-action', 'v63 evolution build marker is not active.');
    assert(interrupted.dataset === 'affiliation-conditioned-persistence', 'v63 dataset marker is not active.');
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'coalition-joint-action-v63.json'), JSON.stringify({
      setup, reverseBefore, affiliateStarted, affiliatePersisted, neutral, interrupted, pageErrors,
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
