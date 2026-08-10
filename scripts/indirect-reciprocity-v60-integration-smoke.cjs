const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_INDIRECT_RECIPROCITY_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'indirect-reciprocity-v60-smoke');
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
      window.realitySandboxIndirectReciprocityV60?.installed &&
      window.realitySandboxIndirectReciprocityInspectorV60a?.installed &&
      window.realitySandboxEvolutionDiagnosticsV60?.installed
    ), null, { timeout:120000 });

    const state = await page.evaluate(() => ({
      inspector:window.realitySandboxIndirectReciprocityInspectorV60a.getStats(),
      diagnostics:window.realitySandboxEvolutionDiagnosticsV60.invariants(),
      build:window.realitySandboxEvolutionBuild,
      runtimeDataset:document.documentElement.dataset.indirectReciprocityV60,
      inspectorDataset:document.documentElement.dataset.indirectReciprocityInspectorV60a,
      diagnosticsDataset:document.documentElement.dataset.evolutionDiagnosticsV60,
    }));

    assert(state.inspector?.installed, 'v60 inspector did not install.');
    assert(state.inspector.lineageIndirectReciprocityView && state.inspector.witnessedReputationAdjustmentView, 'v60 inspector lacks reputation-biased aid views.');
    assert(state.inspector.directVsIndirectView && state.inspector.conservedTransferBoundaryView, 'v60 inspector does not distinguish direct/indirect aid or conservation boundary.');
    assert(state.diagnostics?.ok, `v60 aggregate invariants failed: ${(state.diagnostics?.failures || []).join(' | ')}`);
    assert(state.runtimeDataset === 'local-witnessed-aid-ranking', 'v60 runtime dataset marker is not active.');
    assert(state.inspectorDataset === 'ready', 'v60 inspector dataset marker is not active.');
    assert(state.diagnosticsDataset === 'ready-local-indirect-reciprocity', 'v60 diagnostics dataset marker is not active.');
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'indirect-reciprocity-v60-integration.json'), JSON.stringify({ state, pageErrors }, null, 2));
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
