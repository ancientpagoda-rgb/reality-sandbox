const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_INDIRECT_RECIPROCITY_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'indirect-reciprocity-v60-smoke');
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
      window.realitySandboxReciprocalCooperationV58?.installed &&
      window.realitySandboxPublicReputationV59?.installed &&
      window.realitySandboxIndirectReciprocityV60?.installed
    ), null, { timeout:120000 });

    const setup = await page.evaluate(() => {
      const planet = window.realitySandboxPlanet;
      const c = planet.world.ecs.components;
      for (const id of [...c.motile.keys()]) planet.world.ecs.destroyEntity(id);
      for (const [, res] of c.resource.entries()) res.amount = 0;
      for (const [, det] of c.detritus.entries()) det.amount = 0;

      const lineageId = 'v60-test-lineage';
      const base = { x:planet.world.width * 0.42, y:planet.world.height * 0.53 };
      const genome = {
        photosynthesis:0,
        heterotrophy:0.08,
        motility:0,
        sense:0.8,
        brainSpeed:1,
        sociality:0.9,
        dormancy:0.4,
        toxin:0,
        neurotoxin:0,
        scavenging:0,
        aggression:0,
        armor:0.2,
        seedInvestment:0.2,
        metabolism:0.01,
        bodySize:0.5,
      };

      function add(x, energy, sleeping = false) {
        const id = planet.world.ecs.createEntity();
        c.position.set(id, { x, y:base.y });
        c.velocity.set(id, { vx:0, vy:0 });
        c.motile.set(id, {
          lineageId,
          generation:4,
          plantAncestorId:null,
          energy,
          age:14,
          state:sleeping ? 'sleeping' : 'awake',
          sleepDebt:0.05,
          decisionCooldown:999,
          neurotoxinLoad:0,
          genome:{ ...genome },
          bioV50:{ mode:'rest', drives:{ rest:1 }, hunger:0, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null },
          bioV51:null,
          bioV52:{ learningRate:0.9, retention:0.9, memories:{ food:null, danger:null, hunt:null }, recalledAction:null, recalledMemory:null, lastEnergy:energy, formedAtStep:0, lastSocialReceivedAtStep:null },
          bioV53:{ openness:0.9, conformity:0.8, practices:{ 'food-route':null, 'danger-avoidance':null, 'pack-hunt':null }, appliedPractice:null, learnedFrom:null, lastEnergy:energy, culturalAge:0 },
          bioV54:null,
          bioV55:null,
          bioV56:null,
          bioV57:null,
          bioV58:null,
          bioV59:null,
          bioV60:null,
        });
        return id;
      }

      const observerId = add(base.x, 1.45);
      const reputedId = add((base.x - 92 + planet.world.width) % planet.world.width, 0.24);
      const nearerId = add((base.x + 64) % planet.world.width, 0.24);
      const recipientId = add((base.x + 360) % planet.world.width, 1.1, true);
      return { observerId, reputedId, nearerId, recipientId, lineageId, base, width:planet.world.width };
    });

    // Baseline: with no witnessed reputation and otherwise equivalent requesters,
    // v60 must pass through the original v58 ranking. The nearer requester wins.
    await page.evaluate(ticks => window.realitySandboxDebug.advance(ticks), STEP_TICKS);
    const baseline = await page.evaluate(({ observerId, reputedId, nearerId }) => ({
      observer:window.realitySandboxReciprocalCooperationV58.getCooperation(observerId),
      reputationForFarther:window.realitySandboxPublicReputationV59.getReputation(observerId, reputedId),
      reputationForNearer:window.realitySandboxPublicReputationV59.getReputation(observerId, nearerId),
      v60:window.realitySandboxIndirectReciprocityV60.getIndirectReciprocity(observerId),
    }), setup);

    assert(baseline.observer?.lastAidChoice?.requesterId === setup.nearerId, 'No-evidence baseline did not choose the nearer requester.');
    assert(Math.abs(baseline.observer?.lastAidChoice?.externalScoreAdjustment || 0) < 1e-12, 'v60 changed the v58 score without reputation evidence.');
    assert(!baseline.reputationForFarther && !baseline.reputationForNearer, 'Baseline observer already had a requester reputation.');

    // Clear direct v58 debt and create a separate public-aid event. The future
    // helper is merely a third-party witness while reputedId physically aids
    // recipientId, so it gains v59 evidence without receiving aid itself.
    await page.evaluate(({ setup }) => {
      const c = window.realitySandboxPlanet.world.ecs.components;
      const observer = c.motile.get(setup.observerId);
      const reputed = c.motile.get(setup.reputedId);
      const nearer = c.motile.get(setup.nearerId);
      const recipient = c.motile.get(setup.recipientId);

      observer.energy = 0.50;
      observer.state = 'awake';
      observer.bioV58.ledgers = {};
      observer.bioV58.lastAidChoice = null;
      reputed.energy = 1.45;
      reputed.state = 'awake';
      recipient.energy = 0.24;
      recipient.state = 'awake';
      nearer.energy = 1.05;
      nearer.state = 'sleeping';

      c.position.set(setup.reputedId, { x:(setup.base.x - 50 + setup.width) % setup.width, y:setup.base.y });
      c.position.set(setup.recipientId, { x:(setup.base.x + 50) % setup.width, y:setup.base.y });
      c.position.set(setup.observerId, { ...setup.base });
      c.position.set(setup.nearerId, { x:(setup.base.x + setup.width * 0.44) % setup.width, y:setup.base.y });
      for (const id of [setup.observerId, setup.reputedId, setup.nearerId, setup.recipientId]) c.velocity.set(id, { vx:0, vy:0 });
    }, { setup });

    await page.evaluate(ticks => window.realitySandboxDebug.advance(ticks), STEP_TICKS);
    const witnessed = await page.evaluate(({ observerId, reputedId, recipientId }) => ({
      reputation:window.realitySandboxPublicReputationV59.getReputation(observerId, reputedId),
      observerCooperation:window.realitySandboxReciprocalCooperationV58.getCooperation(observerId),
      reputedCooperation:window.realitySandboxReciprocalCooperationV58.getCooperation(reputedId),
      recipientCooperation:window.realitySandboxReciprocalCooperationV58.getCooperation(recipientId),
      publicEvents:window.realitySandboxPublicReputationV59.getRecentPublicAidEvents(),
    }), setup);

    assert(witnessed.reputedCooperation?.lastAidChoice?.requesterId === setup.recipientId, 'Reputed organism did not perform the witnessed public aid.');
    assert(witnessed.recipientCooperation?.lastAidReceived?.helperId === setup.reputedId, 'Witness phase produced no completed physical aid transfer.');
    assert(witnessed.reputation?.aidWitnesses >= 1 && witnessed.reputation?.prosociality > 0, 'Observer did not learn a positive v59 reputation from the public aid event.');
    assert(!witnessed.observerCooperation?.ledgers?.[String(setup.reputedId)], 'Third-party witness acquired a direct v58 debt ledger for the helper.');
    const publicEvent = witnessed.publicEvents.find(event => event.helperId === setup.reputedId && event.recipientId === setup.recipientId);
    assert(publicEvent, 'Public v59 aid event was not recorded.');
    assert(!('amount' in publicEvent) && !('energy' in publicEvent) && !('need' in publicEvent), 'Public reputation event leaked hidden aid/need magnitude.');

    // Restore the exact baseline geometry. Clear direct v58 ledger evidence again.
    // The nearer requester remains closer, but only the farther requester has a
    // reputation personally witnessed by observerId.
    await page.evaluate(({ setup }) => {
      const c = window.realitySandboxPlanet.world.ecs.components;
      const observer = c.motile.get(setup.observerId);
      const reputed = c.motile.get(setup.reputedId);
      const nearer = c.motile.get(setup.nearerId);
      const recipient = c.motile.get(setup.recipientId);

      observer.energy = 1.45;
      observer.state = 'awake';
      observer.bioV58.ledgers = {};
      observer.bioV58.lastAidChoice = null;
      reputed.energy = 0.24;
      reputed.state = 'awake';
      nearer.energy = 0.24;
      nearer.state = 'awake';
      recipient.energy = 1.1;
      recipient.state = 'sleeping';

      c.position.set(setup.observerId, { ...setup.base });
      c.position.set(setup.reputedId, { x:(setup.base.x - 92 + setup.width) % setup.width, y:setup.base.y });
      c.position.set(setup.nearerId, { x:(setup.base.x + 64) % setup.width, y:setup.base.y });
      c.position.set(setup.recipientId, { x:(setup.base.x + setup.width * 0.44) % setup.width, y:setup.base.y });
      for (const id of [setup.observerId, setup.reputedId, setup.nearerId, setup.recipientId]) c.velocity.set(id, { vx:0, vy:0 });
    }, { setup });

    await page.evaluate(ticks => window.realitySandboxDebug.advance(ticks), STEP_TICKS);
    const indirect = await page.evaluate(({ observerId, reputedId, nearerId }) => ({
      observer:window.realitySandboxReciprocalCooperationV58.getCooperation(observerId),
      reputationForFarther:window.realitySandboxPublicReputationV59.getReputation(observerId, reputedId),
      reputationForNearer:window.realitySandboxPublicReputationV59.getReputation(observerId, nearerId),
      v60:window.realitySandboxIndirectReciprocityV60.getIndirectReciprocity(observerId),
      stats:window.realitySandboxIndirectReciprocityV60.getStats(),
      cooperationStats:window.realitySandboxReciprocalCooperationV58.getStats(),
      build:window.realitySandboxEvolutionBuild,
      dataset:document.documentElement.dataset.indirectReciprocityV60,
    }), setup);

    assert(indirect.observer?.lastAidChoice?.requesterId === setup.reputedId, 'Witnessed reputation did not reverse the baseline request ranking.');
    assert(indirect.observer?.lastAidChoice?.reciprocal === false, 'Indirect-reciprocity choice was incorrectly attributed to direct reciprocity.');
    assert((indirect.observer?.lastAidChoice?.externalScoreAdjustment || 0) > 0, 'Chosen reputed requester received no v60 score adjustment.');
    assert(indirect.v60?.lastIndirectAidChoice?.requesterId === setup.reputedId, 'v60 did not record the indirectly biased aid choice.');
    assert(indirect.reputationForFarther?.aidWitnesses >= 1, 'Farther requester lost its witnessed reputation before choice.');
    assert(!indirect.reputationForNearer, 'Nearer requester gained invented reputation evidence.');

    const flags = indirect.stats;
    assert(flags.version === 'v60a-local-indirect-reciprocity', 'Wrong v60 runtime version.');
    assert(flags.ownWitnessedReputationOnly && flags.reputationEvidenceFromV59Only && flags.noGlobalReputationLookup, 'v60 reputation-source contract failed.');
    assert(flags.noBorrowedPrivateLedgers && flags.noHiddenRecipientNeedInspection && flags.noEvidencePreservesV58Score, 'v60 privacy/pass-through contract failed.');
    assert(flags.aidRankingOnly && flags.v58ConservedTransferPreserved && flags.authoritativeFixedStep, 'v60 aid/conservation/fixed-step contract failed.');
    assert(flags.indirectlyBiasedAidChoices >= 1 && flags.indirectlyBiasedAidEvents >= 1, 'v60 counted no indirectly biased aid event.');
    assert(flags.noHardPopulationCap && flags.noHardDisplayCap && !flags.surfaceRendererEnabled, 'v60 cap/renderer invariants failed.');
    assert(indirect.cooperationStats.aidRequestScoreModifierSupported && indirect.cooperationStats.aidRequestScoreModifierInstalled, 'v58 generic score seam is not installed.');

    const conservationError = Math.abs(
      indirect.cooperationStats.energyDebited -
      indirect.cooperationStats.energyReceived -
      indirect.cooperationStats.metabolicAidCost
    );
    assert(conservationError < 1e-9, `v58 aid energy accounting changed under v60 (${conservationError}).`);
    assert(indirect.build === 'evolution-v60-indirect-reciprocity', 'v60 evolution build marker is not active.');
    assert(indirect.dataset === 'local-witnessed-aid-ranking', 'v60 dataset marker is not active.');
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'indirect-reciprocity-v60.json'), JSON.stringify({
      setup, baseline, witnessed, indirect, conservationError, pageErrors,
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
