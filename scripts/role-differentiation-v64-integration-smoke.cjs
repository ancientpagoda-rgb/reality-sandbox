const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_ROLE_DIFFERENTIATION_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'role-differentiation-v64-smoke');
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
      window.realitySandboxRoleDifferentiationV64?.installed &&
      window.realitySandboxRoleDifferentiationInspectorV64a?.installed &&
      window.realitySandboxEvolutionDiagnosticsV64?.installed
    ), null, { timeout:120000 });

    const state = await page.evaluate(() => ({
      inspector:window.realitySandboxRoleDifferentiationInspectorV64a.getStats(),
      diagnostics:window.realitySandboxEvolutionDiagnosticsV64.invariants(),
      build:window.realitySandboxEvolutionBuild,
      runtimeDataset:document.documentElement.dataset.roleDifferentiationV64,
      inspectorDataset:document.documentElement.dataset.roleDifferentiationInspectorV64a,
      diagnosticsDataset:document.documentElement.dataset.evolutionDiagnosticsV64,
    }));

    assert(state.inspector?.installed, 'v64 inspector did not install.');
    assert(state.inspector.scalarTendencyView && state.inspector.ownHistoryEvidenceView, 'v64 inspector lacks scalar/history views.');
    assert(state.inspector.complementaryAudienceView && state.inspector.responderPersistenceView, 'v64 inspector lacks behavioral consequence views.');
    assert(state.inspector.noAssignedRoleView && state.inspector.geneticSymmetryBreakingView, 'v64 inspector lacks no-assignment/history-divergence views.');
    assert(state.diagnostics?.ok, `v64 aggregate invariants failed: ${(state.diagnostics?.failures || []).join(' | ')}`);
    assert(state.build === 'evolution-v64-role-differentiation', 'v64 latest build marker is not active.');
    assert(state.runtimeDataset === 'history-dependent-complementarity', 'v64 runtime dataset marker is not active.');
    assert(state.inspectorDataset === 'ready', 'v64 inspector dataset marker is not active.');
    assert(state.diagnosticsDataset === 'ready-role-differentiation', 'v64 diagnostics dataset marker is not active.');
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'role-differentiation-v64-integration.json'), JSON.stringify({ state, pageErrors }, null, 2));
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
