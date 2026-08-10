const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_DISTRIBUTED_PLANNING_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'distributed-planning-v67-smoke');
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
      window.realitySandboxDistributedPlanningV67?.installed &&
      window.realitySandboxDistributedPlanningInspectorV67a?.installed &&
      window.realitySandboxEvolutionDiagnosticsV67?.installed
    ), null, { timeout:120000 });

    const state = await page.evaluate(() => ({
      inspector:window.realitySandboxDistributedPlanningInspectorV67a.getStats(),
      diagnostics:window.realitySandboxEvolutionDiagnosticsV67.invariants(),
      runtime:window.realitySandboxDistributedPlanningV67.getStats(),
      build:window.realitySandboxEvolutionBuild,
      runtimeDataset:document.documentElement.dataset.distributedPlanningV67,
      inspectorDataset:document.documentElement.dataset.distributedPlanningInspectorV67a,
      diagnosticsDataset:document.documentElement.dataset.evolutionDiagnosticsV67,
    }));

    assert(state.inspector?.installed, 'v67 inspector did not install.');
    assert(state.inspector.privateTransitionMemoryView && state.inspector.privateForecastView, 'v67 inspector lacks private transition/forecast views.');
    assert(state.inspector.divergentPlanView && state.inspector.physicalExecutionView, 'v67 inspector lacks divergent-plan/physical-execution views.');
    assert(state.inspector.revisionAndDangerOverrideView && state.inspector.noSharedPlannerStateView, 'v67 inspector lacks revision/no-shared-planner views.');
    assert(state.diagnostics?.ok, `v67 aggregate invariants failed: ${(state.diagnostics?.failures || []).join(' | ')}`);
    assert(state.runtime.version === 'v67a-private-transition-planning', 'Wrong v67 runtime version.');
    assert(state.runtime.maxTransitionRecords === 12 && state.runtime.minTransitionSuccesses === 2, 'v67 transition bounds changed.');
    assert(state.runtime.planConfidenceThreshold === 0.65 && state.runtime.minPriorPhysicalProgress === 0.08, 'v67 planning thresholds changed.');
    assert(state.build === 'evolution-v67-distributed-multistep-planning', 'v67 latest build marker is not active.');
    assert(state.runtimeDataset === 'private-prospective-plans', 'v67 runtime dataset marker is not active.');
    assert(state.inspectorDataset === 'ready', 'v67 inspector dataset marker is not active.');
    assert(state.diagnosticsDataset === 'ready-distributed-multistep-planning', 'v67 diagnostics dataset marker is not active.');
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'distributed-planning-v67-integration.json'), JSON.stringify({ state, pageErrors }, null, 2));
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
