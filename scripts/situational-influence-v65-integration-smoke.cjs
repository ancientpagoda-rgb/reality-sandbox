const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_SITUATIONAL_INFLUENCE_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'situational-influence-v65-smoke');
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
      window.realitySandboxSituationalInfluenceV65?.installed &&
      window.realitySandboxSituationalInfluenceInspectorV65a?.installed &&
      window.realitySandboxEvolutionDiagnosticsV65?.installed
    ), null, { timeout:120000 });

    const state = await page.evaluate(() => ({
      inspector:window.realitySandboxSituationalInfluenceInspectorV65a.getStats(),
      diagnostics:window.realitySandboxEvolutionDiagnosticsV65.invariants(),
      runtime:window.realitySandboxSituationalInfluenceV65.getStats(),
      joint:window.realitySandboxCoalitionJointActionV63.getStats(),
      build:window.realitySandboxEvolutionBuild,
      runtimeDataset:document.documentElement.dataset.situationalInfluenceV65,
      inspectorDataset:document.documentElement.dataset.situationalInfluenceInspectorV65a,
      diagnosticsDataset:document.documentElement.dataset.evolutionDiagnosticsV65,
    }));

    assert(state.inspector?.installed, 'v65 inspector did not install.');
    assert(state.inspector.derivedEdgeView && state.inspector.independentConvergenceView, 'v65 inspector lacks derived convergence views.');
    assert(state.inspector.reversibleInfluenceView && state.inspector.ownOutcomeEvidenceView, 'v65 inspector lacks reversible/private-history views.');
    assert(state.inspector.boundedCommitmentConsequenceView && state.inspector.noLeaderStateView, 'v65 inspector lacks bounded-consequence/no-leader views.');
    assert(state.diagnostics?.ok, `v65 aggregate invariants failed: ${(state.diagnostics?.failures || []).join(' | ')}`);
    assert(state.runtime.version === 'v65a-derived-situational-influence', 'Wrong v65 runtime version.');
    assert(state.joint.multipleCommitmentModifiersSupported && state.joint.commitmentModifierCount >= 2, 'v64+v65 modifier chain is not active.');
    assert(state.joint.maxCommitmentSteps === 6, 'v65 changed the v63 commitment cap.');
    assert(state.runtimeDataset === 'derived-reversible-influence', 'v65 runtime dataset marker is not active.');
    assert(state.inspectorDataset === 'ready', 'v65 inspector dataset marker is not active.');
    assert(state.diagnosticsDataset === 'ready-situational-influence', 'v65 diagnostics dataset marker is not active.');
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'situational-influence-v65-integration.json'), JSON.stringify({ state, pageErrors }, null, 2));
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
