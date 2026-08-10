const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_COALITION_JOINT_ACTION_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'coalition-joint-action-v63-smoke');
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
      window.realitySandboxCoalitionJointActionV63?.installed &&
      window.realitySandboxCoalitionJointActionInspectorV63a?.installed &&
      window.realitySandboxEvolutionDiagnosticsV63?.installed
    ), null, { timeout:120000 });

    const state = await page.evaluate(() => ({
      inspector:window.realitySandboxCoalitionJointActionInspectorV63a.getStats(),
      diagnostics:window.realitySandboxEvolutionDiagnosticsV63.invariants(),
      build:window.realitySandboxEvolutionBuild,
      runtimeDataset:document.documentElement.dataset.coalitionJointActionV63,
      inspectorDataset:document.documentElement.dataset.coalitionJointActionInspectorV63a,
      diagnosticsDataset:document.documentElement.dataset.evolutionDiagnosticsV63,
    }));

    assert(state.inspector?.installed, 'v63 inspector did not install.');
    assert(state.inspector.activeCommitmentView && state.inspector.directionalContributionView, 'v63 inspector lacks commitment/physical-contribution views.');
    assert(state.inspector.ownAffiliationBoundaryView && state.inspector.noGroupCommandView, 'v63 inspector lacks own-affiliation/no-command boundary views.');
    assert(state.inspector.urgentDangerOverrideView && state.inspector.boundedPersistenceView, 'v63 inspector lacks danger/bounded-persistence views.');
    assert(state.diagnostics?.ok, `v63 aggregate invariants failed: ${(state.diagnostics?.failures || []).join(' | ')}`);
    assert(state.runtimeDataset === 'affiliation-conditioned-persistence', 'v63 runtime dataset marker is not active.');
    assert(state.inspectorDataset === 'ready', 'v63 inspector dataset marker is not active.');
    assert(state.diagnosticsDataset === 'ready-coalition-joint-action', 'v63 diagnostics dataset marker is not active.');
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'coalition-joint-action-v63-integration.json'), JSON.stringify({ state, pageErrors }, null, 2));
  } finally {
    await browser.close();
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }
})().catch(error => {
  fs.writeFileSync(path.join(artifactDir, 'integration-fatal-error.txt'), `${error.stack || error.message}\n`);
  console.error(error);
  process.exitCode = 1;
});
