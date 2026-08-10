const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_LOCAL_NORMS_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'local-social-norms-v61-smoke');
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

  async function advanceUntil(readSnapshot, ready, label, maxCadences = 12) {
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
      window.realitySandboxReciprocalCooperationV58?.installed &&
      window.realitySandboxIndirectReciprocityV60?.installed &&
      window.realitySandboxLocalSocialNormsV61?.installed
    ), null, { timeout:120000 });

    const setup = await page.evaluate(() => {
      const planet = window.realitySandboxPlanet;
      const c = planet.world.ecs.components;
      for (const id of [...c.motile.keys()]) planet.world.ecs.destroyEntity(id);
      for (const [, res] of c.resource.entries()) res.amount = 0;
      for (const [, det] of c.detritus.entries()) det.amount = 0;

      const lineageId = 'v61-test-lineage';
      const xHigh = planet.world.width * 0.22;
      const xLow = planet.world.width * 0.72;
      const y = planet.world.height * 0.52;
      const genome = {
        photosynthesis:0, heterotrophy:0.08, motility:0, sense:0.8, brainSpeed:1,
        sociality:0.9, dormancy:0.4, toxin:0, neurotoxin:0, scavenging:0,
        aggression:0, armor:0.2, seedInvestment:0.2, metabolism:0.01, bodySize:0.5,
      };

      function add(x, energy, sleeping = false) {
        const id = planet.world.ecs.createEntity();
        c.position.set(id, { x:(x + planet.world.width) % planet.world.width, y });
        c.velocity.set(id, { vx:0, vy:0 });
        c.motile.set(id, {
          lineageId, generation:5, plantAncestorId:null, energy, age:16,
          state:sleeping ? 'sleeping' : 'awake', sleepDebt:0.05, decisionCooldown:999,
          neurotoxinLoad:0, genome:{ ...genome },
          bioV50:{ mode:'rest', drives:{ rest:1 }, hunger:0, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null },
          bioV51:null,
          bioV52:{ learningRate:0.9, retention:0.9, memories:{ food:null, danger:null, hunt:null }, recalledAction:null, recalledMemory:null, lastEnergy:energy, formedAtStep:0, lastSocialReceivedAtStep:null },
          bioV53:{ openness:0.9, conformity:0.8, practices:{ 'food-route':null, 'danger-avoidance':null, 'pack-hunt':null }, appliedPractice:null, learnedFrom:null, lastEnergy:energy, culturalAge:0 },
          bioV54:null, bioV55:null, bioV56:null, bioV57:null, bioV58:null, bioV59:null, bioV60:null, bioV61:null,
        });
        return id;
      }

      const highHelperId = add(xHigh, 0.70);
      const highRequesterId = add(xHigh + 48, 0.24);
      const trainerDonorId = add(xHigh + 92, 1.48);
      const lowHelperId = add(xLow, 0.70);
      const lowRequesterId = add(xLow + 48, 0.24);
      return { highHelperId, highRequesterId, trainerDonorId, lowHelperId, lowRequesterId, lineageId, xHigh, xLow, y, width:planet.world.width };
    });

    const readTraining = () => page.evaluate(({ highHelperId, lowHelperId }) => ({
      high:window.realitySandboxLocalSocialNormsV61.getNorm(highHelperId),
      low:window.realitySandboxLocalSocialNormsV61.getNorm(lowHelperId),
      stats:window.realitySandboxLocalSocialNormsV61.getStats(),
    }), setup);

    let training = null;
    for (let round = 1; round <= 2; round++) {
      await page.evaluate(({ setup }) => {
        const c = window.realitySandboxPlanet.world.ecs.components;
        const highHelper = c.motile.get(setup.highHelperId);
        const highRequester = c.motile.get(setup.highRequesterId);
        const donor = c.motile.get(setup.trainerDonorId);
        const lowHelper = c.motile.get(setup.lowHelperId);
        const lowRequester = c.motile.get(setup.lowRequesterId);

        highHelper.energy = 0.70; highHelper.state = 'awake'; highHelper.decisionCooldown = 999;
        lowHelper.energy = 0.70; lowHelper.state = 'awake'; lowHelper.decisionCooldown = 999;
        donor.energy = 1.48; donor.state = 'awake'; donor.decisionCooldown = 999;
        highRequester.energy = 0.24; highRequester.state = 'awake'; highRequester.decisionCooldown = 999;
        lowRequester.energy = 0.24; lowRequester.state = 'awake'; lowRequester.decisionCooldown = 999;
        if (highRequester.bioV58) highRequester.bioV58.lastAidReceived = null;
        if (lowRequester.bioV58) lowRequester.bioV58.lastAidReceived = null;
        for (const id of [setup.highHelperId, setup.highRequesterId, setup.trainerDonorId, setup.lowHelperId, setup.lowRequesterId]) c.velocity.set(id, { vx:0, vy:0 });
      }, { setup });

      training = await advanceUntil(
        readTraining,
        state => (state.high?.normEvidence || 0) >= round && (state.low?.normEvidence || 0) >= round,
        `Local norm training round ${round}`
      );
    }

    assert(training.high.answeredObserved >= 2, 'High-helping neighborhood did not learn from answered requests.');
    assert(training.low.unansweredObserved >= 2, 'Low-helping neighborhood did not learn from unanswered requests.');
    assert(training.high.helpingNorm > 0.65, `Answered-request neighborhood norm stayed too low (${training.high.helpingNorm}).`);
    assert(training.low.helpingNorm < 0.35, `Unanswered-request neighborhood norm stayed too high (${training.low.helpingNorm}).`);

    await page.evaluate(({ setup }) => {
      const c = window.realitySandboxPlanet.world.ecs.components;
      const highHelper = c.motile.get(setup.highHelperId);
      const highRequester = c.motile.get(setup.highRequesterId);
      const donor = c.motile.get(setup.trainerDonorId);
      const lowHelper = c.motile.get(setup.lowHelperId);
      const lowRequester = c.motile.get(setup.lowRequesterId);

      donor.state = 'sleeping'; donor.energy = 0.40;
      highHelper.energy = 1.20; highHelper.state = 'awake'; highHelper.decisionCooldown = 999;
      lowHelper.energy = 1.20; lowHelper.state = 'awake'; lowHelper.decisionCooldown = 999;
      highRequester.energy = 0.24; highRequester.state = 'awake'; highRequester.decisionCooldown = 999;
      lowRequester.energy = 0.24; lowRequester.state = 'awake'; lowRequester.decisionCooldown = 999;

      for (const helper of [highHelper, lowHelper]) {
        helper.bioV57 = null;
        helper.bioV58 ||= { ledgers:{}, lastAidChoice:null };
        helper.bioV58.ledgers = {};
        helper.bioV58.lastAidChoice = null;
        if (helper.bioV61) helper.bioV61.pendingRequests = [];
      }
      if (highRequester.bioV58) highRequester.bioV58.lastAidReceived = null;
      if (lowRequester.bioV58) lowRequester.bioV58.lastAidReceived = null;

      c.position.set(setup.highHelperId, { x:setup.xHigh, y:setup.y });
      c.position.set(setup.highRequesterId, { x:(setup.xHigh + 160) % setup.width, y:setup.y });
      c.position.set(setup.trainerDonorId, { x:(setup.xHigh + setup.width * 0.34) % setup.width, y:setup.y });
      c.position.set(setup.lowHelperId, { x:setup.xLow, y:setup.y });
      c.position.set(setup.lowRequesterId, { x:(setup.xLow + 160) % setup.width, y:setup.y });
      for (const id of [setup.highHelperId, setup.highRequesterId, setup.trainerDonorId, setup.lowHelperId, setup.lowRequesterId]) c.velocity.set(id, { vx:0, vy:0 });
    }, { setup });

    const readDecision = () => page.evaluate(({ highHelperId, highRequesterId, lowHelperId, lowRequesterId }) => ({
      highNorm:window.realitySandboxLocalSocialNormsV61.getNorm(highHelperId),
      lowNorm:window.realitySandboxLocalSocialNormsV61.getNorm(lowHelperId),
      highChoice:window.realitySandboxReciprocalCooperationV58.getCooperation(highHelperId)?.lastAidChoice || null,
      lowChoice:window.realitySandboxReciprocalCooperationV58.getCooperation(lowHelperId)?.lastAidChoice || null,
      highReceipt:window.realitySandboxReciprocalCooperationV58.getCooperation(highRequesterId)?.lastAidReceived || null,
      lowReceipt:window.realitySandboxReciprocalCooperationV58.getCooperation(lowRequesterId)?.lastAidReceived || null,
      highRep:window.realitySandboxPublicReputationV59.getReputation(highHelperId, highRequesterId),
      lowRep:window.realitySandboxPublicReputationV59.getReputation(lowHelperId, lowRequesterId),
      stats:window.realitySandboxLocalSocialNormsV61.getStats(),
      cooperationStats:window.realitySandboxReciprocalCooperationV58.getStats(),
      publicRequests:window.realitySandboxReciprocalCooperationV58.getRecentPublicSolicitations(),
      build:window.realitySandboxEvolutionBuild,
      dataset:document.documentElement.dataset.localSocialNormsV61,
    }), setup);

    const decision = await advanceUntil(
      readDecision,
      state => state.highChoice?.requesterId === setup.highRequesterId && state.lowChoice?.requesterId === setup.lowRequesterId,
      'Divergent norm-conditioned aid decisions',
      4
    );

    assert(decision.highRep == null && decision.lowRep == null, 'v60 reputation evidence contaminated the norm-only decision.');
    assert(decision.highChoice.reciprocal === false && decision.lowChoice.reciprocal === false, 'Direct v58 reciprocity contaminated the norm-only decision.');
    assert(decision.highChoice.emitted === true, 'High-helping local norm did not lift the borderline request into aid.');
    assert(decision.lowChoice.emitted === false, 'Low-helping local norm did not suppress the equivalent borderline request.');
    assert((decision.highNorm.lastNormScore?.adjustment || 0) > 0, 'High-helping norm produced no positive willingness adjustment.');
    assert((decision.lowNorm.lastNormScore?.adjustment || 0) < 0, 'Low-helping norm produced no negative willingness adjustment.');
    assert(decision.highReceipt?.helperId === setup.highHelperId, 'High-norm helper produced no physical aid transfer.');
    assert(!decision.lowReceipt, 'Low-norm helper transferred aid despite its suppressed decision.');

    const flags = decision.stats;
    assert(flags.version === 'v61a-local-answered-request-norms', 'Wrong v61 runtime version.');
    assert(flags.normFromPublicRequestsAndAidOnly && flags.unansweredRequestsAreGroupEvidence && flags.noIndividualRefusalAttribution, 'v61 public group-evidence contract failed.');
    assert(flags.publicRequestStreamHidesNeedMagnitude && flags.differentGroupsCanLearnDifferentNorms, 'v61 locality/privacy norm contract failed.');
    assert(flags.noEvidencePreservesV60Score && flags.normsAffectAidWillingness && flags.v60IndirectReciprocityPreserved, 'v61 behavior-composition contract failed.');
    assert(flags.v58ConservedTransferPreserved && flags.boundedPendingRequestMemory && flags.maxPendingRequests === 6, 'v61 conservation/memory contract failed.');
    assert(flags.authoritativeFixedStep && flags.noHardPopulationCap && flags.noHardDisplayCap && !flags.surfaceRendererEnabled, 'v61 fixed-step/cap/renderer contract failed.');

    const requestFlags = decision.cooperationStats;
    assert(requestFlags.publicSolicitationEventStream && requestFlags.publicSolicitationHidesNeedMagnitude && requestFlags.maxPublicSolicitationEvents === 32, 'v58 bounded public-request stream contract failed.');
    assert(decision.publicRequests.length > 0, 'No public solicitation events were exposed.');
    assert(decision.publicRequests.every(event =>
      !('urgency' in event) && !('strength' in event) && !('radius' in event) &&
      !('energy' in event) && !('need' in event) && !('score' in event)
    ), 'Public solicitation stream leaked private need or scoring information.');

    const conservationError = Math.abs(
      requestFlags.energyDebited - requestFlags.energyReceived - requestFlags.metabolicAidCost
    );
    assert(conservationError < 1e-9, `v58 aid energy accounting changed under v61 (${conservationError}).`);
    assert(decision.build === 'evolution-v61-local-social-norms', 'v61 evolution build marker is not active.');
    assert(decision.dataset === 'answered-request-neighborhood-learning', 'v61 dataset marker is not active.');
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'local-social-norms-v61.json'), JSON.stringify({ setup, training, decision, conservationError, pageErrors }, null, 2));
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
