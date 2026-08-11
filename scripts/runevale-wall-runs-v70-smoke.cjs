const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_RUNEVALE_V70_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'runevale-wall-runs-v70-smoke');
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
      window.realitySandboxDebug?.ready &&
      window.realitySandboxRunevaleSettlementV68?.installed &&
      window.realitySandboxRunevaleCastlePerimetersV69?.installed &&
      window.realitySandboxRunevaleWallRunsV70?.installed
    ), null, { timeout:120000 });

    await page.evaluate(() => window.realitySandboxRunevaleSettlementV68.resetForTest());

    const site = await page.evaluate(() => {
      const planet = window.realitySandboxPlanet;
      const v69 = window.realitySandboxRunevaleCastlePerimetersV69;
      const c = planet.world.ecs.components;
      const wrap = value => ((value % planet.world.width) + planet.world.width) % planet.world.width;
      const dirs = [0, Math.PI * 0.5, Math.PI * 0.25, -Math.PI * 0.25];
      const points = [...c.position.values()].slice(0, 260);
      for (const p of points) {
        const center = planet.living.sampleDynamicPlanet(p.x, p.y, 'v70-site-center');
        const water = planet.waterCycle.sample(p.x, p.y, 'v70-site-center');
        if (!center?.land || Number(water?.lake || 0) > 0.45) continue;
        for (const angle of dirs) {
          const ax = Math.cos(angle), ay = Math.sin(angle);
          const bx = Math.cos(angle + Math.PI * 0.5), by = Math.sin(angle + Math.PI * 0.5);
          const first = [];
          const second = [];
          for (let i = 0; i < 5; i++) {
            const d = (i + 0.5) * 8;
            first.push(v69.validateAt('palisade', wrap(p.x + ax * d), p.y + ay * d, angle - Math.PI * 0.5));
          }
          const cornerX = wrap(p.x + ax * 40);
          const cornerY = p.y + ay * 40;
          for (let i = 0; i < 3; i++) {
            const d = (i + 0.5) * 8;
            second.push(v69.validateAt('palisade', wrap(cornerX + bx * d), cornerY + by * d, angle));
          }
          if (first.every(check => check.ok) && second.every(check => check.ok)) {
            return { x:p.x, y:p.y, angle, cornerX, cornerY, first, second };
          }
        }
      }
      return null;
    });
    assert(site, 'No real terrain site could support the deterministic 40+24 unit L-shaped wall run.');

    const harvest = await page.evaluate(() => {
      const api = window.realitySandboxRunevaleSettlementV68;
      const surface = window.realitySandboxSurfaceMode;
      const planet = window.realitySandboxPlanet;
      const c = planet.world.ecs.components;
      const events = [];
      const resources = [...c.resource.entries()]
        .map(([id, item]) => ({ id, item, p:c.position.get(id) }))
        .filter(entry => entry.p && Number(entry.item.amount) > 0.12 && planet.living.sampleDynamicPlanet(entry.p.x, entry.p.y, 'v70-harvest-find')?.land)
        .slice(0, 40);
      for (const entry of resources) {
        surface.enterAt(entry.p.x, entry.p.y);
        const result = api.gatherWood();
        events.push({ id:entry.id, result });
        if (api.getState().playerPack.wood >= 72) break;
      }
      return { events, state:api.getState(), stats:api.getStats() };
    });
    assert(harvest.state.playerPack.wood >= 64, `Physical harvest did not produce enough wood for 64 constructed wall units (${harvest.state.playerPack.wood}).`);
    assert(harvest.stats.ecologicalResourceDebited > 0 && harvest.stats.woodHarvestEvents >= 7, 'Wall-run materials were not grounded in repeated ecological harvests.');

    const founded = await page.evaluate(({ x, y }) => {
      window.realitySandboxSurfaceMode.enterAt(x, y);
      return window.realitySandboxRunevaleSettlementV68.foundSettlement('Longwall');
    }, site);
    assert(founded.ok, `Wall-run settlement founding failed: ${founded.reason || 'unknown'}.`);

    const first = await page.evaluate(({ x, y, angle }) => {
      const v70 = window.realitySandboxRunevaleWallRunsV70;
      const w = window.realitySandboxPlanet.world.width;
      const end = { x:((x + Math.cos(angle) * 42) % w + w) % w, y:y + Math.sin(angle) * 42 };
      const plan = v70.planRun({ x, y }, end);
      const checked = v70.validatePlan(plan);
      const placed = v70.placeWallRun({ x, y }, end);
      return { plan, checked, placed, state:window.realitySandboxRunevaleSettlementV68.getState(), stats:v70.getStats() };
    }, site);

    assert(first.plan.ok && first.checked.ok && first.placed.ok, `First wall run failed: ${first.placed.reason || first.checked.reason || 'unknown'}.`);
    assert(first.plan.segments === 5, `42-unit requested wall did not quantize to five physical segments (${first.plan.segments}).`);
    assert(first.plan.constructedLength === 40, `First run constructed length is not 40 (${first.plan.constructedLength}).`);
    assert(Math.abs(first.plan.endpointError - 2) < 1e-6, `42→40 quantization error should be 2 units (${first.plan.endpointError}).`);
    assert(first.placed.placed.length === 5, 'First run did not create five authoritative v69/v68 blueprints.');
    assert(first.state.structures.length === 5, `First run produced ${first.state.structures.length} structures instead of five.`);
    assert(first.state.structures.reduce((sum, item) => sum + item.required.wood, 0) === 40, 'First-run material cost is not proportional to its 40 constructed units.');

    const second = await page.evaluate(({ plan, angle }) => {
      const v70 = window.realitySandboxRunevaleWallRunsV70;
      const w = window.realitySandboxPlanet.world.width;
      const start = { x:((plan.constructedEnd.x + 1.15) % w + w) % w, y:plan.constructedEnd.y + 0.55 };
      const side = angle + Math.PI * 0.5;
      const end = { x:((plan.constructedEnd.x + Math.cos(side) * 25) % w + w) % w, y:plan.constructedEnd.y + Math.sin(side) * 25 };
      const planned = v70.planRun(start, end);
      const placed = v70.placeWallRun(start, end);
      return {
        start,
        end,
        planned,
        placed,
        state:window.realitySandboxRunevaleSettlementV68.getState(),
        v70:v70.getStats(),
        graph:window.realitySandboxRunevaleCastlePerimetersV69.getPerimeters({ completedOnly:false }),
      };
    }, { plan:first.plan, angle:site.angle });

    assert(second.planned.ok && second.placed.ok, `Second endpoint-connected run failed: ${second.placed.reason || 'unknown'}.`);
    assert(second.planned.snappedStart, 'Second wall run did not snap its offset start to the first run endpoint.');
    assert(second.planned.snappedEndpoint?.structureId === 5, `Second run snapped to the wrong first-run structure (${second.planned.snappedEndpoint?.structureId}).`);
    assert(second.planned.segments === 3 && second.planned.constructedLength === 24, `25-unit second run did not quantize to 3/24 (${second.planned.segments}/${second.planned.constructedLength}).`);
    assert(second.state.structures.length === 8, `Two wall runs produced ${second.state.structures.length} structures instead of eight.`);
    assert(second.graph.totalLinearSegments === 8, `v69 graph does not see all eight wall-run segments (${second.graph.totalLinearSegments}).`);
    const joined = second.graph.components.find(component => component.segments === 8);
    assert(joined && !joined.closed, 'Two connected wall runs did not derive one open eight-segment component.');
    assert(Math.abs(joined.length - 64) < 1e-6, `Derived two-run physical length is not 64 (${joined.length}).`);
    assert(second.v70.startSnaps >= 1, 'v70 did not record endpoint snapping for the second run.');
    assert(second.v70.quantizationErrorBound === 4, 'v70 wall-run endpoint quantization bound changed.');

    let built = null;
    for (let chunk = 0; chunk < 100; chunk++) {
      await page.evaluate(() => window.realitySandboxDebug.advance(60));
      built = await page.evaluate(() => ({
        state:window.realitySandboxRunevaleSettlementV68.getState(),
        v68:window.realitySandboxRunevaleSettlementV68.getStats(),
        v70:window.realitySandboxRunevaleWallRunsV70.getStats(),
      }));
      if (built.state.structures.filter(item => item.status === 'complete').length === 8) break;
    }

    assert(built.state.structures.filter(item => item.status === 'complete').length === 8, 'Workers did not physically finish all eight wall-run segments.');
    assert(built.state.structures.every(item => item.delivered.wood >= item.required.wood && item.progress === 1), 'A completed wall-run segment lacks delivered material or work completion.');
    assert(built.v68.materialHauls >= 16 && built.v68.constructionWorkTicks > 0, 'Long wall runs bypassed physical v68 hauling/construction.');
    assert(built.v68.defense >= 24, `Eight completed palisades did not derive expected defense (${built.v68.defense}).`);
    assert(built.v70.runsPlaced === 2 && built.v70.segmentsPlaced === 8, `v70 run accounting is incorrect (${built.v70.runsPlaced}/${built.v70.segmentsPlaced}).`);
    assert(built.v70.requestedLengthTotal > 66 && built.v70.constructedLengthTotal === 64, 'v70 requested/constructed length accounting is invalid.');
    assert(built.v70.materialCostPerConstructedUnit === 1 && built.v70.workPerConstructedUnit === 1, 'Wall-run physical cost/work scaling changed.');
    assert(built.v70.usesV69FullFootprintValidation && built.v70.usesV68PhysicalMaterialsAndWorkers, 'v70 bypassed the v69/v68 construction stack.');
    assert(built.v70.noHardWallRunLengthCap && built.v70.noHardWallRunSegmentCap && built.v70.noHardBuildingCap, 'v70 introduced an arbitrary run/building cap.');

    const ui = await page.evaluate(() => ({
      button:Boolean(document.querySelector('#runevaleSettlementHudV68 .runevale-v70-wall-run')),
      dataset:document.documentElement.dataset.runevaleWallRunsV70,
      build:window.realitySandboxEvolutionBuild,
    }));
    assert(ui.button, 'v70 wall-run start/end control is not available in the build HUD.');
    assert(ui.dataset === 'quantized-physical-wall-runs', 'v70 runtime dataset marker is missing.');
    assert(ui.build === 'evolution-v67-distributed-multistep-planning', `v70 gameplay incorrectly replaced the evolution build (${ui.build}).`);
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'runevale-wall-runs-v70.json'), JSON.stringify({ site, harvest, founded, first, second, built, ui, pageErrors }, null, 2));
    await page.screenshot({ path:path.join(artifactDir, 'runevale-wall-runs-v70.png'), fullPage:true });
  } finally {
    await browser.close();
  }
})().catch(error => {
  fs.writeFileSync(path.join(artifactDir, 'fatal-error.txt'), `${error.stack || error.message}\n`);
  console.error(error);
  process.exitCode = 1;
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
