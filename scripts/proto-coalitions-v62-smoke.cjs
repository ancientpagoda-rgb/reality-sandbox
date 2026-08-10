const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_PROTO_COALITIONS_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'proto-coalitions-v62-smoke');
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
      window.realitySandboxReciprocalCooperationV58?.installed &&
      window.realitySandboxPublicReputationV59?.installed &&
      window.realitySandboxProtoCoalitionsV62?.installed
    ), null, { timeout:120000 });

    const setup = await page.evaluate(() => {
      const planet = window.realitySandboxPlanet;
      const c = planet.world.ecs.components;
      for (const id of [...c.motile.keys()]) planet.world.ecs.destroyEntity(id);
      for (const [, res] of c.resource.entries()) res.amount = 0;
      for (const [, det] of c.detritus.entries()) det.amount = 0;

      const lineageId = 'v62-test-lineage';
      const base = { x:planet.world.width * 0.44, y:planet.world.height * 0.52 };
      const genome = {
        photosynthesis:0, heterotrophy:0.08, motility:0, sense:0.8, brainSpeed:1,
        sociality:0.9, dormancy:0.4, toxin:0, neurotoxin:0, scavenging:0,
        aggression:0, armor:0.2, seedInvestment:0.2, metabolism:0.01, bodySize:0.5,
      };

      function add(x, y, energy) {
        const id = planet.world.ecs.createEntity();
        c.position.set(id, { x:(x + planet.world.width) % planet.world.width, y });
        c.velocity.set(id, { vx:0, vy:0 });
        c.motile.set(id, {
          lineageId, generation:6, plantAncestorId:null, energy, age:18,
          state:'awake', sleepDebt:0.05, decisionCooldown:999, neurotoxinLoad:0,
          genome:{ ...genome },
          bioV50:{ mode:'rest', drives:{ rest:1 }, hunger:0, targetPlant:null, targetDetritus:null, detectedDanger:null, detectedPrey:null },
          bioV51:null,
          bioV52:{ learningRate:0.9, retention:0.9, memories:{ food:null, danger:null, hunt:null }, recalledAction:null, recalledMemory:null, lastEnergy:energy, formedAtStep:0, lastSocialReceivedAtStep:null },
          bioV53:{ openness:0.9, conformity:0.8, practices:{ 'food-route':null, 'danger-avoidance':null, 'pack-hunt':null }, appliedPractice:null, learnedFrom:null, lastEnergy:energy, culturalAge:0 },
          bioV54:null, bioV55:null, bioV56:null, bioV57:null, bioV58:null, bioV59:null, bioV60:null, bioV61:null, bioV62:null,
        });
        return id;
      }

      const aId = add(base.x, base.y, 0.24);
      const bId = add(base.x + 82, base.y, 1.48);
      const observerId = add(base.x + 38, base.y + 28, 0.70);
      return { aId, bId, observerId, lineageId, base, width:planet.world.width };
    });

    const readFirstAid = () => page.evaluate(({ aId, bId, observerId }) => ({
      a:window.realitySandboxReciprocalCooperationV58.getCooperation(aId),
      b:window.realitySandboxReciprocalCooperationV58.getCooperation(bId),
      observerRep:window.realitySandboxPublicReputationV59.getReputation(observerId, bId),
      observerAffiliation:window.realitySandboxProtoCoalitionsV62.getAffiliation(observerId),
    }), setup);

    const firstAid = await advanceUntil(
      readFirstAid,
      state => state.a?.lastAidReceived?.helperId === setup.bId && state.observerRep?.aidWitnesses >= 1,
      'B helps A while third party witnesses'
    );
    assert(firstAid.b?.lastAidChoice?.requesterId === setup.aId, 'B did not physically aid A.');
    assert(firstAid.observerRep?.aidWitnesses >= 1, 'Third-party observer did not witness B helping A.');

    await page.evaluate(({ setup }) => {
      const c = window.realitySandboxPlanet.world.ecs.components;
      const a = c.motile.get(setup.aId);
      const b = c.motile.get(setup.bId);
      const observer = c.motile.get(setup.observerId);
      a.energy = 1.48; a.state = 'awake'; a.decisionCooldown = 999;
      b.energy = 0.24; b.state = 'awake'; b.decisionCooldown = 999;
      observer.energy = 0.70; observer.state = 'awake'; observer.decisionCooldown = 999;
      if (b.bioV58) b.bioV58.lastAidReceived = null;
      c.position.set(setup.aId, { ...setup.base });
      c.position.set(setup.bId, { x:(setup.base.x + 82) % setup.width, y:setup.base.y });
      c.position.set(setup.observerId, { x:(setup.base.x + 38) % setup.width, y:setup.base.y + 28 });
      for (const id of [setup.aId, setup.bId, setup.observerId]) c.velocity.set(id, { vx:0, vy:0 });
    }, { setup });

    const readReciprocalAid = () => page.evaluate(({ aId, bId }) => ({
      a:window.realitySandboxReciprocalCooperationV58.getCooperation(aId),
      b:window.realitySandboxReciprocalCooperationV58.getCooperation(bId),
    }), setup);

    const reciprocalAid = await advanceUntil(
      readReciprocalAid,
      state => state.b?.lastAidReceived?.helperId === setup.aId,
      'A reciprocates physical aid to B'
    );
    assert(reciprocalAid.a?.lastAidChoice?.requesterId === setup.bId, 'A did not physically reciprocate aid to B.');

    await page.evaluate(({ setup }) => {
      const c = window.realitySandboxPlanet.world.ecs.components;
      for (const id of [setup.aId, setup.bId, setup.observerId]) {
        const organism = c.motile.get(id);
        organism.energy = 1.10;
        organism.state = 'awake';
        organism.decisionCooldown = 999;
        c.velocity.set(id, { vx:0, vy:0 });
      }
    }, { setup });

    const readCoalition = () => page.evaluate(({ aId, bId, observerId }) => {
      const social = window.realitySandboxSocialModelsV57;
      return {
        a:window.realitySandboxProtoCoalitionsV62.getAffiliation(aId),
        b:window.realitySandboxProtoCoalitionsV62.getAffiliation(bId),
        observer:window.realitySandboxProtoCoalitionsV62.getAffiliation(observerId),
        observerRep:window.realitySandboxPublicReputationV59.getReputation(observerId, bId),
        graph:window.realitySandboxProtoCoalitionsV62.getCoalitionGraph(),
        scoreB:social.scoreAudience(aId, bId, 0.50),
        scoreObserver:social.scoreAudience(aId, observerId, 0.50),
        stats:window.realitySandboxProtoCoalitionsV62.getStats(),
        build:window.realitySandboxEvolutionBuild,
        dataset:document.documentElement.dataset.protoCoalitionsV62,
      };
    }, setup);

    const coalition = await advanceUntil(
      readCoalition,
      state => state.graph.edges.some(edge =>
        (edge.a === setup.aId && edge.b === setup.bId) || (edge.a === setup.bId && edge.b === setup.aId)
      ),
      'Mutual affiliation coalition edge'
    );

    const aToB = coalition.a?.affiliations?.[String(setup.bId)] || null;
    const bToA = coalition.b?.affiliations?.[String(setup.aId)] || null;
    const observerToB = coalition.observer?.affiliations?.[String(setup.bId)] || null;
    const bToObserver = coalition.b?.affiliations?.[String(setup.observerId)] || null;
    assert(aToB?.affinity >= coalition.stats.mutualBondThreshold, `A affiliation to B stayed below mutual threshold (${aToB?.affinity}).`);
    assert(bToA?.affinity >= coalition.stats.mutualBondThreshold, `B affiliation to A stayed below mutual threshold (${bToA?.affinity}).`);
    assert((aToB.sourceMask & 1) === 1 && (bToA.sourceMask & 1) === 1, 'Mutual coalition did not retain direct cooperation evidence.');
    assert(observerToB?.witnessedProsocialEvidence > 0, 'Third-party witness developed no one-sided public-behavior affinity toward B.');
    assert((observerToB.sourceMask & 4) === 4, 'Observer affinity did not identify witnessed public behavior as evidence.');
    assert(
      !bToObserver || bToObserver.affinity < coalition.stats.mutualBondThreshold || bToObserver.evidenceStrength < 0.20,
      'Public witness affinity unexpectedly became a mutual B↔observer coalition-eligible bond.'
    );

    const mutualEdge = coalition.graph.edges.find(edge =>
      (edge.a === setup.aId && edge.b === setup.bId) || (edge.a === setup.bId && edge.b === setup.aId)
    );
    assert(mutualEdge, 'A/B mutual coalition edge is missing.');
    const component = coalition.graph.components.find(item => item.members.includes(setup.aId) && item.members.includes(setup.bId));
    assert(component, 'A/B mutual affiliation did not form a derived coalition component.');
    assert(!component.members.includes(setup.observerId), 'One-sided observer affinity incorrectly created coalition membership.');
    assert(coalition.scoreB > coalition.scoreObserver + 0.03, `Affiliation did not bias A's audience score toward B (${coalition.scoreB} vs ${coalition.scoreObserver}).`);

    for (const state of [coalition.a, coalition.b, coalition.observer]) {
      assert(!('coalitionId' in state) && !('groupId' in state) && !('membership' in state), 'Agent state contains an explicit coalition/group identity.');
      assert(Object.keys(state.affiliations || {}).length <= 8, 'Agent affiliation memory exceeded its cognitive bound.');
    }

    const flags = coalition.stats;
    assert(flags.version === 'v62a-mutual-affiliation-networks', 'Wrong v62 runtime version.');
    assert(flags.agentsUseOwnEvidenceOnly && flags.noPrivateAffiliationInspectionForBehavior, 'v62 own-evidence/private-state boundary failed.');
    assert(flags.directCooperationEvidence && flags.communicationOutcomeEvidence && flags.witnessedPublicBehaviorEvidence, 'v62 evidence-source contract failed.');
    assert(flags.noExplicitGroupIdentity && flags.noStoredCoalitionMembership && flags.coalitionDerivedFromMutualAffiliation, 'v62 emergent coalition contract failed.');
    assert(flags.oneSidedAffinityDoesNotCreateCoalition && flags.affiliationBiasesAudienceSelection, 'v62 mutuality/behavior contract failed.');
    assert(flags.boundedAffiliationMemory && flags.maxAffiliations === 8, 'v62 affiliation memory bound failed.');
    assert(flags.evidenceRequiresPriorLocalSocialExperience && flags.authoritativeFixedStep, 'v62 locality/fixed-step contract failed.');
    assert(flags.noHardPopulationCap && flags.noHardDisplayCap && !flags.surfaceRendererEnabled, 'v62 cap/renderer invariants failed.');
    assert(coalition.dataset === 'mutual-affiliation-network', 'v62 dataset marker is not active.');
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'proto-coalitions-v62.json'), JSON.stringify({ setup, firstAid, reciprocalAid, coalition, pageErrors }, null, 2));
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
