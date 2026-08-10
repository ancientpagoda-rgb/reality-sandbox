const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_PROTO_COALITIONS_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'proto-coalitions-v62-smoke');
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
      window.realitySandboxProtoCoalitionsV62?.installed &&
      window.realitySandboxProtoCoalitionsInspectorV62a?.installed &&
      window.realitySandboxEvolutionDiagnosticsV62?.installed
    ), null, { timeout:120000 });

    const state = await page.evaluate(() => ({
      inspector:window.realitySandboxProtoCoalitionsInspectorV62a.getStats(),
      diagnostics:window.realitySandboxEvolutionDiagnosticsV62.invariants(),
      build:window.realitySandboxEvolutionBuild,
      runtimeDataset:document.documentElement.dataset.protoCoalitionsV62,
      inspectorDataset:document.documentElement.dataset.protoCoalitionsInspectorV62a,
      diagnosticsDataset:document.documentElement.dataset.evolutionDiagnosticsV62,
    }));

    assert(state.inspector?.installed, 'v62 inspector did not install.');
    assert(state.inspector.mutualEdgeView && state.inspector.derivedComponentView, 'v62 inspector lacks mutual graph views.');
    assert(state.inspector.oneSidedAffiliationView && state.inspector.evidenceSourceView, 'v62 inspector lacks one-sided/evidence views.');
    assert(state.inspector.noStoredMembershipView, 'v62 inspector does not preserve the no-stored-membership boundary.');
    assert(state.diagnostics?.ok, `v62 aggregate invariants failed: ${(state.diagnostics?.failures || []).join(' | ')}`);
    assert(state.build === 'evolution-v62-proto-coalitions', 'v62 latest build marker is not active.');
    assert(state.runtimeDataset === 'mutual-affiliation-network', 'v62 runtime dataset marker is not active.');
    assert(state.inspectorDataset === 'ready', 'v62 inspector dataset marker is not active.');
    assert(state.diagnosticsDataset === 'ready-proto-coalitions', 'v62 diagnostics dataset marker is not active.');
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'proto-coalitions-v62-integration.json'), JSON.stringify({ state, pageErrors }, null, 2));
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
