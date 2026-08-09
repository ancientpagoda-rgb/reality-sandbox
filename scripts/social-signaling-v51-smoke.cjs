const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_SOCIAL_SIGNALING_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'social-signaling-v51-smoke');
fs.mkdirSync(artifactDir, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--disable-dev-shm-usage','--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  try {
    await page.goto(baseUrl, { waitUntil:'domcontentloaded', timeout:120000 });
    await page.waitForFunction(() => Boolean(
      window.realitySandboxDebug?.ready &&
      window.realitySandboxOriginMotileLifeV47?.installed &&
      window.realitySandboxSensoryBrainsV50?.installed &&
      window.realitySandboxSocialSignalingV51?.installed &&
      window.realitySandboxSocialSignalingInspectorV51a?.installed
    ), null, { timeout:120000 });

    await page.evaluate(() => window.realitySandboxDebug.advance(3600));

    const setup = await page.evaluate(() => {
      const planet = window.realitySandboxPlanet;
      const c = planet.world.ecs.components;
      const origin = window.realitySandboxOriginMotileLifeV47;
      const motiles = origin.getMotiles();
      const donor = motiles.find(x => x.position) || null;
      if (!donor) return { ok:false, reason:'no donor motile' };
      const resources = [...c.resource.entries()].find(([id, res]) => {
        const p = c.position.get(id);
        return p && (res.amount || 0) > 0.2;
      });
      if (!resources) return { ok:false, reason:'no resource target' };
      const [resourceId] = resources;
      const donorOrg = c.motile.get(donor.id);
      const donorPos = c.position.get(donor.id);
      donorOrg.genome.sociality = 1;
      donorOrg.genome.brainSpeed = 1;
      donorOrg.genome.sense = 1;
      donorOrg.genome.heterotrophy = Math.max(0.6, donorOrg.genome.heterotrophy || 0);
      donorOrg.bioV50 = {
        ...(donorOrg.bioV50 || {}),
        mode:'graze',
        targetPlant:resourceId,
        targetDetritus:null,
        detectedDanger:null,
        detectedPrey:null,
      };

      const receiverId = planet.world.ecs.createEntity();
      c.position.set(receiverId, { x: donorPos.x + 4, y: donorPos.y + 3 });
      c.velocity.set(receiverId, { vx:0, vy:0 });
      c.motile.set(receiverId, {
        lineageId: donorOrg.lineageId,
        generation: donorOrg.generation,
        plantAncestorId: donorOrg.plantAncestorId,
        energy:1.2,
        age:5,
        state:'awake',
        sleepDebt:0.1,
        decisionCooldown:0,
        neurotoxinLoad:0,
        genome:{ ...donorOrg.genome, sociality:1, brainSpeed:1, sense:1 },
      });
      return { ok:true, donorId:donor.id, receiverId, lineageId:donorOrg.lineageId, resourceId };
    });
    assert(setup.ok, `v51 deterministic setup failed: ${setup.reason || 'unknown'}`);

    await page.evaluate(() => window.realitySandboxDebug.advance(20));

    const state = await page.evaluate(({ receiverId, lineageId }) => {
      const social = window.realitySandboxSocialSignalingV51;
      const inspector = window.realitySandboxEvolutionInspectorV47b;
      const socialInspector = window.realitySandboxSocialSignalingInspectorV51a;
      inspector.selectLineage(lineageId);
      inspector.open();
      socialInspector.render();
      const host = document.getElementById('evolutionInspectorV47bHost');
      const root = host?.shadowRoot;
      return {
        stats:social.getStats(),
        receiver:social.getSignalsReceived().find(x => x.id === receiverId) || null,
        inspectorStats:socialInspector.getStats(),
        inspectorText:root?.querySelector('.social-v51-body')?.textContent || '',
        diagnostics:window.realitySandboxEvolutionDiagnosticsV48d?.invariants?.() || null,
        evolutionBuild:document.documentElement.dataset.evolutionBuild,
      };
    }, setup);

    assert(state.stats.installed === true, 'v51 signaling is not installed.');
    assert(state.stats.authoritativeFixedStep === true && state.stats.spatialHashing === true, 'v51 signaling is outside fixed-step/spatial-hash contract.');
    assert(state.stats.inheritedSignalPropensity && state.stats.kinRestrictedSignals, 'v51 signaling is not inherited/kin-restricted.');
    assert(state.stats.foodCalls > 0, 'v51 emitted no deterministic food call.');
    assert(state.stats.signalsReceived > 0, 'v51 had no signal reception.');
    assert(state.receiver && state.receiver.signalType === 'food', 'Temporary kin receiver did not receive the expected food signal.');
    assert(state.inspectorStats.lineageSignalView === true && state.inspectorText.length > 0, 'v51 inspector did not expose signaling state.');
    assert(state.diagnostics?.ok === true, `Evolution diagnostics failed: ${(state.diagnostics?.failures || []).join(' | ')}`);
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'social-signaling-v51.json'), JSON.stringify({ setup, state, pageErrors }, null, 2));
    await page.screenshot({ path:path.join(artifactDir, 'social-signaling-v51.png'), fullPage:true });
  } finally {
    await browser.close();
  }

  function assert(condition, message) { if (!condition) throw new Error(message); }
})().catch(error => {
  fs.writeFileSync(path.join(artifactDir, 'fatal-error.txt'), `${error.stack || error.message}\n`);
  console.error(error);
  process.exitCode = 1;
});
