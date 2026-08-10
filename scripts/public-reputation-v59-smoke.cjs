const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_PUBLIC_REPUTATION_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'public-reputation-v59-smoke');
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
      window.realitySandboxPublicReputationV59?.installed
    ), null, { timeout:120000 });

    const setup = await page.evaluate(() => {
      const planet = window.realitySandboxPlanet;
      const c = planet.world.ecs.components;
      for (const id of [...c.motile.keys()]) planet.world.ecs.destroyEntity(id);
      for (const [, res] of c.resource.entries()) res.amount = 0;
      for (const [, det] of c.detritus.entries()) det.amount = 0;

      const lineageId = 'v59-test-lineage';
      const base = { x:planet.world.width * 0.42, y:planet.world.height * 0.50 };
      const genome = {
        photosynthesis:0, heterotrophy:0.08, motility:0, sense:0.86, brainSpeed:1,
        sociality:0.92, dormancy:0.35, toxin:0, neurotoxin:0, scavenging:0,
        aggression:0, armor:0.2, seedInvestment:0.2, metabolism:0.01, bodySize:0.5,
      };

      function add(x, y, energy) {
        const id = planet.world.ecs.createEntity();
        c.position.set(id, { x:(x + planet.world.width) % planet.world.width, y });
        c.velocity.set(id, { vx:0, vy:0 });
        c.motile.set(id, {
          lineageId, generation:4, plantAncestorId:null, energy, age:12, state:'awake',
          sleepDebt:0.05, decisionCooldown:999, neurotoxinLoad:0, genome:{ ...genome },
          bioV50:{ mode:'rest', drives:{ rest:1 }, hunger:0, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null },
          bioV51:null,
          bioV52:{ learningRate:0.9, retention:0.9, memories:{ food:null, danger:null, hunt:null }, recalledAction:null, recalledMemory:null, lastEnergy:energy, formedAtStep:0, lastSocialReceivedAtStep:null },
          bioV53:{ openness:0.9, conformity:0.8, practices:{ 'food-route':null, 'danger-avoidance':null, 'pack-hunt':null }, appliedPractice:null, learnedFrom:null, lastEnergy:energy, culturalAge:0 },
          bioV54:null, bioV55:null, bioV56:null, bioV57:null, bioV58:null, bioV59:null,
        });
        return id;
      }

      const recipientId = add(base.x, base.y, 0.24);
      const helperId = add(base.x + 78, base.y, 1.48);
      const observerId = add(base.x + 34, base.y + 24, 0.76);
      const strangerId = add(base.x + 46, base.y - 34, 0.76);
      const farObserverId = add(base.x + 430, base.y, 0.76);
      return { recipientId, helperId, observerId, strangerId, farObserverId, lineageId };
    });

    await page.evaluate(ticks => window.realitySandboxDebug.advance(ticks), STEP_TICKS);

    const state = await page.evaluate(({ recipientId, helperId, observerId, strangerId, farObserverId }) => {
      const reputation = window.realitySandboxPublicReputationV59;
      const social = window.realitySandboxSocialModelsV57;
      const cooperation = window.realitySandboxReciprocalCooperationV58;
      const helperScore = social.scoreAudience(observerId, helperId, 0.50);
      const strangerScore = social.scoreAudience(observerId, strangerId, 0.50);
      return {
        stats:reputation.getStats(),
        recipient:cooperation.getCooperation(recipientId),
        observer:reputation.getObserverReputations(observerId),
        witnessedHelper:reputation.getReputation(observerId, helperId),
        unwitnessedFar:reputation.getReputation(farObserverId, helperId),
        stranger:reputation.getReputation(observerId, strangerId),
        helperScore,
        strangerScore,
        publicEvents:reputation.getRecentPublicAidEvents(),
        evolutionBuild:window.realitySandboxEvolutionBuild,
        dataset:document.documentElement.dataset.publicReputationV59,
      };
    }, setup);

    assert(state.recipient?.lastAidReceived?.helperId === setup.helperId, 'v58 did not produce the physical aid event used by v59.');
    assert(state.witnessedHelper?.aidWitnesses >= 1, 'Nearby third-party observer learned no reputation from witnessed aid.');
    assert(state.witnessedHelper?.prosociality > 0.1, 'Witnessed aid did not create a positive prosocial estimate.');
    assert(state.unwitnessedFar == null, 'Distant observer learned reputation without physically witnessing the event.');
    assert(state.stranger == null, 'Observer invented reputation for an unwitnessed stranger.');
    assert(state.observer?.lastWitnessedAid?.helperId === setup.helperId, 'Observer did not retain the witnessed helper identity.');
    assert(state.helperScore > state.strangerScore + 0.03, `Witnessed reputation did not bias audience score (${state.helperScore} vs ${state.strangerScore}).`);
    assert(state.publicEvents.length >= 1, 'v59 exposed no public aid event.');
    assert(state.publicEvents.every(event => !('received' in event) && !('debit' in event) && !('energy' in event) && !('urgency' in event)), 'Public reputation event leaked hidden aid/need magnitude.');

    const flags = state.stats;
    assert(flags.installed && flags.version === 'v59a-local-witnessed-reputation', 'Wrong v59 runtime version.');
    assert(flags.reputationFromPublicAidOnly && flags.thirdPartyWitnessRequired && flags.localSensoryWitnessRequired, 'v59 witnessed-public-evidence contract failed.');
    assert(flags.noGlobalReputationRegistry && flags.observersCanDisagree && flags.noHiddenAidAmount, 'v59 no-global/no-telepathy contract failed.');
    assert(flags.noPrivateLedgerInspectionByAgents && flags.reputationBiasesAudienceSelection, 'v59 reputation behavior contract failed.');
    assert(flags.boundedReputationMemory && flags.maxReputationEntries === 8, 'v59 reputation memory is not bounded.');
    assert(flags.spatialHashing && flags.authoritativeFixedStep && flags.noHardPopulationCap && flags.noHardDisplayCap, 'v59 performance/cap invariants failed.');
    // This is a subsystem smoke, not a latest-build smoke. Later evolution phases
    // may legitimately own the global build marker while v59 remains installed.
    assert(state.dataset === 'local-third-party-witnesses', 'v59 dataset marker is not active.');
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'public-reputation-v59.json'), JSON.stringify({ setup, state, pageErrors }, null, 2));
    try {
      await page.screenshot({ path:path.join(artifactDir, 'public-reputation-v59.png'), fullPage:false, timeout:10000 });
    } catch (error) {
      fs.writeFileSync(path.join(artifactDir, 'screenshot-warning.txt'), `${error.stack || error.message}\n`);
    }
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
