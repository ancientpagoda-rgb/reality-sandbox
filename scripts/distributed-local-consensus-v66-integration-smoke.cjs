const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_DISTRIBUTED_CONSENSUS_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'distributed-consensus-v66-smoke');
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
      window.realitySandboxDistributedConsensusV66?.installed &&
      window.realitySandboxDistributedConsensusInspectorV66a?.installed &&
      window.realitySandboxEvolutionDiagnosticsV66?.installed
    ), null, { timeout:120000 });

    const state = await page.evaluate(() => ({
      inspector:window.realitySandboxDistributedConsensusInspectorV66a.getStats(),
      diagnostics:window.realitySandboxEvolutionDiagnosticsV66.invariants(),
      runtime:window.realitySandboxDistributedConsensusV66.getStats(),
      build:window.realitySandboxEvolutionBuild,
      runtimeDataset:document.documentElement.dataset.distributedConsensusV66,
      inspectorDataset:document.documentElement.dataset.distributedConsensusInspectorV66a,
      diagnosticsDataset:document.documentElement.dataset.evolutionDiagnosticsV66,
    }));

    assert(state.inspector?.installed, 'v66 inspector did not install.');
    assert(state.inspector.perOrganismDecisionView && state.inspector.derivedAlignmentView, 'v66 inspector lacks per-organism/derived-alignment views.');
    assert(state.inspector.splitAndReformView && state.inspector.decisionMarginView, 'v66 inspector lacks split/reform and margin views.');
    assert(state.inspector.physicalConsequenceView && state.inspector.noGlobalVoteOrAuthorityView, 'v66 inspector lacks physical/no-authority views.');
    assert(state.diagnostics?.ok, `v66 aggregate invariants failed: ${(state.diagnostics?.failures || []).join(' | ')}`);
    assert(state.runtime.version === 'v66a-distributed-local-consensus', 'Wrong v66 runtime version.');
    assert(state.runtime.decisionThreshold === 0.12 && state.runtime.marginThreshold === 0.08 && state.runtime.directionSectors === 8, 'v66 decision constants changed.');
    assert(state.runtimeDataset === 'private-local-decisions', 'v66 runtime dataset marker is not active.');
    assert(state.inspectorDataset === 'ready', 'v66 inspector dataset marker is not active.');
    assert(state.diagnosticsDataset === 'ready-distributed-local-consensus', 'v66 diagnostics dataset marker is not active.');
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'distributed-consensus-v66-integration.json'), JSON.stringify({ state, pageErrors }, null, 2));
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
