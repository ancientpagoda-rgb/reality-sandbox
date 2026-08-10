const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_LOCAL_NORMS_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'local-social-norms-v61-smoke');
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
      window.realitySandboxLocalSocialNormsV61?.installed &&
      window.realitySandboxLocalSocialNormsInspectorV61a?.installed &&
      window.realitySandboxEvolutionDiagnosticsV61?.installed
    ), null, { timeout:120000 });

    const state = await page.evaluate(() => ({
      inspector:window.realitySandboxLocalSocialNormsInspectorV61a.getStats(),
      diagnostics:window.realitySandboxEvolutionDiagnosticsV61.invariants(),
      build:window.realitySandboxEvolutionBuild,
      runtimeDataset:document.documentElement.dataset.localSocialNormsV61,
      inspectorDataset:document.documentElement.dataset.localSocialNormsInspectorV61a,
      diagnosticsDataset:document.documentElement.dataset.evolutionDiagnosticsV61,
    }));

    assert(state.inspector?.installed, 'v61 inspector did not install.');
    assert(state.inspector.lineageNormView && state.inspector.answeredVsUnansweredView, 'v61 inspector lacks local norm outcome views.');
    assert(state.inspector.localEvidenceView && state.inspector.normConditionedAidView, 'v61 inspector lacks local evidence/behavior views.');
    assert(state.inspector.noIndividualRefusalBlameView, 'v61 inspector does not preserve the no-individual-blame boundary.');
    assert(state.inspector.conservedAidBoundaryView, 'v61 inspector does not expose the conserved v58 aid boundary.');
    assert(state.diagnostics?.ok, `v61 aggregate invariants failed: ${(state.diagnostics?.failures || []).join(' | ')}`);
    assert(state.build === 'evolution-v61-local-social-norms', 'v61 latest build marker is not active.');
    assert(state.runtimeDataset === 'answered-request-neighborhood-learning', 'v61 runtime dataset marker is not active.');
    assert(state.inspectorDataset === 'ready', 'v61 inspector dataset marker is not active.');
    assert(state.diagnosticsDataset === 'ready-local-social-norms', 'v61 diagnostics dataset marker is not active.');
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'local-social-norms-v61-integration.json'), JSON.stringify({ state, pageErrors }, null, 2));
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
