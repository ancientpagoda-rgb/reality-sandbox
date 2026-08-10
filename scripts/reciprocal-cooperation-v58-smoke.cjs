const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_RECIPROCAL_COOPERATION_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'reciprocal-cooperation-v58-smoke');
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
      window.realitySandboxSocialModelsV57?.installed &&
      window.realitySandboxReciprocalCooperationV58?.installed
    ), null, { timeout:120000 });

    const setup = await page.evaluate(() => {
      const planet = window.realitySandboxPlanet;
      const c = planet.world.ecs.components;
      for (const id of [...c.motile.keys()]) planet.world.ecs.destroyEntity(id);
      for (const [, res] of c.resource.entries()) res.amount = 0;
      for (const [, det] of c.detritus.entries()) det.amount = 0;

      const lineageId = 'v58-test-lineage';
      const base = { x:planet.world.width * 0.40, y:planet.world.height * 0.52 };
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

      function add(x, energy) {
        const id = planet.world.ecs.createEntity();
        c.position.set(id, { x, y:base.y });
        c.velocity.set(id, { vx:0, vy:0 });
        c.motile.set(id, {
          lineageId,
          generation:3,
          plantAncestorId:null,
          energy,
          age:12,
          state:'awake',
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
        });
        return id;
      }

      const needyId = add(base.x, 0.24);
      const helperId = add((base.x + 82) % planet.world.width, 1.45);
      const strangerId = add((base.x - 380 + planet.world.width) % planet.world.width, 1.35);
      return { needyId, helperId, strangerId, lineageId, base, width:planet.world.width };
    });

    const initial = await page.evaluate(({ needyId, helperId }) => {
      const c = window.realitySandboxPlanet.world.ecs.components;
      return { needy:c.motile.get(needyId).energy, helper:c.motile.get(helperId).energy };
    }, setup);

    await page.evaluate(ticks => window.realitySandboxDebug.advance(ticks), STEP_TICKS);

    const firstAid = await page.evaluate(({ needyId, helperId }) => {
      const c = window.realitySandboxPlanet.world.ecs.components;
      return {
        needyEnergy:c.motile.get(needyId).energy,
        helperEnergy:c.motile.get(helperId).energy,
        needy:window.realitySandboxReciprocalCooperationV58.getCooperation(needyId),
        helper:window.realitySandboxReciprocalCooperationV58.getCooperation(helperId),
        stats:window.realitySandboxReciprocalCooperationV58.getStats(),
      };
    }, setup);

    assert(firstAid.stats.aidEvents >= 1, 'No first aid event occurred.');
    assert(firstAid.needy?.lastAidReceived?.helperId === setup.helperId, 'Needy organism did not record the physical helper.');
    assert(firstAid.needyEnergy > initial.needy, 'Recipient gained no energy from aid.');
    assert(firstAid.helperEnergy < initial.helper, 'Helper paid no energy cost.');
    assert(firstAid.needy?.ledgers?.[String(setup.helperId)]?.received > 0, 'Recipient did not remember aid received from the helper.');
    assert(firstAid.helper?.ledgers?.[String(setup.needyId)]?.given > 0, 'Helper did not remember aid given.');

    await page.evaluate(({ setup }) => {
      const c = window.realitySandboxPlanet.world.ecs.components;
      const needy = c.motile.get(setup.needyId);
      const helper = c.motile.get(setup.helperId);
      const stranger = c.motile.get(setup.strangerId);

      needy.energy = 1.50;
      helper.energy = 0.24;
      stranger.energy = 0.24;
      needy.state = helper.state = stranger.state = 'awake';
      needy.decisionCooldown = helper.decisionCooldown = stranger.decisionCooldown = 999;
      needy.sleepDebt = helper.sleepDebt = stranger.sleepDebt = 0.05;

      c.position.set(setup.needyId, { ...setup.base });
      // The stranger is closer, but the helper has a real prior aid history.
      c.position.set(setup.strangerId, { x:(setup.base.x + 68) % setup.width, y:setup.base.y });
      c.position.set(setup.helperId, { x:(setup.base.x - 94 + setup.width) % setup.width, y:setup.base.y });
      for (const id of [setup.needyId, setup.helperId, setup.strangerId]) c.velocity.set(id, { vx:0, vy:0 });
    }, { setup });

    await page.evaluate(ticks => window.realitySandboxDebug.advance(ticks), STEP_TICKS);

    const reciprocal = await page.evaluate(({ needyId, helperId, strangerId }) => {
      const c = window.realitySandboxPlanet.world.ecs.components;
      return {
        formerNeedy:window.realitySandboxReciprocalCooperationV58.getCooperation(needyId),
        helper:window.realitySandboxReciprocalCooperationV58.getCooperation(helperId),
        stranger:window.realitySandboxReciprocalCooperationV58.getCooperation(strangerId),
        helperEnergy:c.motile.get(helperId).energy,
        strangerEnergy:c.motile.get(strangerId).energy,
        stats:window.realitySandboxReciprocalCooperationV58.getStats(),
      };
    }, setup);

    assert(reciprocal.formerNeedy?.lastAidChoice?.requesterId === setup.helperId, 'Prior recipient did not choose its previous helper over the closer stranger.');
    assert(reciprocal.formerNeedy?.lastAidChoice?.reciprocal === true, 'Reciprocal choice was not identified as history-dependent.');
    assert(reciprocal.helper?.lastAidReceived?.helperId === setup.needyId, 'Original helper did not receive reciprocal aid.');
    assert(!reciprocal.stranger?.lastAidReceived, 'Closer stranger received aid despite lacking reciprocal history.');
    assert(reciprocal.stats.reciprocalChoices >= 1, 'No reciprocal aid choice was counted.');

    const conservationError = Math.abs(
      reciprocal.stats.energyDebited - reciprocal.stats.energyReceived - reciprocal.stats.metabolicAidCost
    );
    assert(conservationError < 1e-9, `Aid energy accounting is not conserved (${conservationError}).`);
    assert(reciprocal.stats.energyDebited > reciprocal.stats.energyReceived, 'Aid transfer had no physical efficiency cost.');

    const flags = reciprocal.stats;
    assert(flags.version === 'v58a-conserved-reciprocal-aid', 'Wrong v58 runtime version.');
    assert(flags.publicNeedSolicitation && flags.noHiddenRecipientNeedInspection && flags.recipientEnergyNotUsedForChoice, 'v58 public-need/no-telepathy contract failed.');
    assert(flags.aidDecisionUsesOwnSocialModel && flags.reciprocalHistoryBiasesAid && flags.costlyHelping, 'v58 decision/reciprocity contract failed.');
    assert(flags.energyConservingTransfer && Math.abs(flags.transferEfficiency - 0.86) < 1e-12, 'v58 energy-transfer contract failed.');
    assert(flags.boundedPartnerLedger && flags.maxPartnerLedgers === 8, 'v58 cooperation memory is not bounded.');
    assert(flags.physicallyLocalAid && flags.kinBiasedAid && flags.spatialHashing && flags.authoritativeFixedStep, 'v58 locality/fixed-step contract failed.');
    assert(flags.noHardPopulationCap && flags.noHardDisplayCap && !flags.surfaceRendererEnabled, 'v58 cap/renderer invariants failed.');
    assert(window.realitySandboxEvolutionBuild === 'evolution-v58-reciprocal-cooperation', 'v58 evolution build marker is not active.');
    assert(document.documentElement.dataset.reciprocalCooperationV58 === 'conserved-public-solicitation', 'v58 dataset marker is not active.');
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'reciprocal-cooperation-v58.json'), JSON.stringify({
      setup, initial, firstAid, reciprocal, conservationError, pageErrors,
    }, null, 2));
    await page.screenshot({ path:path.join(artifactDir, 'reciprocal-cooperation-v58.png'), fullPage:true });
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
