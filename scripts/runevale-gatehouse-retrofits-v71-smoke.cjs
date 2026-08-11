const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_RUNEVALE_V71_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'runevale-gatehouse-retrofits-v71-smoke');
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
      typeof window.realitySandboxRunevaleSettlementV68?.retrofitStructure === 'function' &&
      window.realitySandboxRunevaleCastlePerimetersV69?.installed &&
      window.realitySandboxRunevaleWallRunsV70?.installed &&
      window.realitySandboxRunevaleGatehouseRetrofitsV71?.installed
    ), null, { timeout:120000 });

    await page.evaluate(() => window.realitySandboxRunevaleSettlementV68.resetForTest());

    const site = await page.evaluate(() => {
      const planet = window.realitySandboxPlanet;
      const v69 = window.realitySandboxRunevaleCastlePerimetersV69;
      const c = planet.world.ecs.components;
      const wrap = value => ((value % planet.world.width) + planet.world.width) % planet.world.width;
      for (const p of [...c.position.values()].slice(0, 280)) {
        const x = p.x;
        const y = p.y;
        const center = planet.living.sampleDynamicPlanet(x, y, 'v71-site-center');
        const water = planet.waterCycle.sample(x, y, 'v71-site-center');
        if (!center?.land || Number(water?.lake || 0) > 0.45) continue;
        const checks = [
          v69.validateAt('palisade', x, y - 4, -Math.PI * 0.5),
          v69.validateAt('palisade', wrap(x + 4), y, 0),
          v69.validateAt('palisade', x, y + 4, -Math.PI * 0.5),
          v69.validateAt('palisade', wrap(x - 4), y, 0),
        ];
        // The first north-side palisade will become the gatehouse. Validate the
        // wider/deeper target footprint before any structures exist, so overlap
        // checks cannot mask a terrain/water problem.
        const gate = v69.validateAt('gatehouse', x, y - 4, -Math.PI * 0.5);
        if (checks.every(check => check.ok) && gate.ok) return { x, y, checks, gate };
      }
      return null;
    });
    assert(site, 'No real terrain site supports both the four-wall enclosure and the wider gatehouse retrofit footprint.');

    const harvest = await page.evaluate(() => {
      const api = window.realitySandboxRunevaleSettlementV68;
      const surface = window.realitySandboxSurfaceMode;
      const planet = window.realitySandboxPlanet;
      const c = planet.world.ecs.components;
      const events = [];
      const resources = [...c.resource.entries()]
        .map(([id, item]) => ({ id, item, p:c.position.get(id) }))
        .filter(entry => entry.p && Number(entry.item.amount) > 0.12 && planet.living.sampleDynamicPlanet(entry.p.x, entry.p.y, 'v71-harvest-find')?.land)
        .slice(0, 36);
      for (const entry of resources) {
        surface.enterAt(entry.p.x, entry.p.y);
        const wood = api.gatherWood();
        const stone = api.gatherStone();
        events.push({ id:entry.id, wood, stone });
        const pack = api.getState().playerPack;
        if (pack.wood >= 44 && pack.stone >= 12) break;
      }
      return { events, state:api.getState(), stats:api.getStats() };
    });
    assert(harvest.state.playerPack.wood >= 36, `Physical harvest did not provide wall + retrofit wood (${harvest.state.playerPack.wood}).`);
    assert(harvest.state.playerPack.stone >= 8, `Physical quarrying did not provide gatehouse retrofit stone (${harvest.state.playerPack.stone}).`);
    assert(harvest.stats.ecologicalResourceDebited > 0 && harvest.stats.stoneReserveDebited >= 8, 'Retrofit material stock is not grounded in physical ecological/stone depletion.');

    const founded = await page.evaluate(({ x, y }) => {
      window.realitySandboxSurfaceMode.enterAt(x, y);
      return window.realitySandboxRunevaleSettlementV68.foundSettlement('Gatewatch');
    }, site);
    assert(founded.ok, `Gatehouse settlement founding failed: ${founded.reason || 'unknown'}.`);

    const walls = await page.evaluate(({ x, y }) => {
      const v69 = window.realitySandboxRunevaleCastlePerimetersV69;
      const w = window.realitySandboxPlanet.world.width;
      const wrap = value => ((value % w) + w) % w;
      const placed = [
        v69.placeAt('palisade', x, y - 4, -Math.PI * 0.5, { snap:false }),
        v69.placeAt('palisade', wrap(x + 4), y, 0, { snap:false }),
        v69.placeAt('palisade', x, y + 4, -Math.PI * 0.5, { snap:false }),
        v69.placeAt('palisade', wrap(x - 4), y, 0, { snap:false }),
      ];
      return { placed, state:window.realitySandboxRunevaleSettlementV68.getState(), graph:v69.getPerimeters({ completedOnly:false }) };
    }, site);
    assert(walls.placed.every(result => result.ok), `One or more square palisades failed placement: ${walls.placed.map(result => result.reason || 'ok').join(' | ')}`);
    assert(walls.state.structures.length === 4, 'Initial castle ring is not exactly four structures.');
    assert(walls.graph.closedCount === 1 && walls.graph.closed[0].segments === 4 && walls.graph.closed[0].gates === 0, 'Initial palisade blueprint ring is not one closed gate-free perimeter.');

    let builtWalls = null;
    for (let chunk = 0; chunk < 55; chunk++) {
      await page.evaluate(() => window.realitySandboxDebug.advance(60));
      builtWalls = await page.evaluate(() => ({
        state:window.realitySandboxRunevaleSettlementV68.getState(),
        graph:window.realitySandboxRunevaleCastlePerimetersV69.getPerimeters({ completedOnly:true }),
        v68:window.realitySandboxRunevaleSettlementV68.getStats(),
      }));
      if (builtWalls.graph.closedCount === 1 && builtWalls.state.structures.every(item => item.status === 'complete')) break;
    }
    assert(builtWalls.graph.closedCount === 1 && builtWalls.graph.closed[0].gates === 0, 'Workers did not complete the original closed palisade perimeter.');
    assert(builtWalls.state.settlement.defense === 12, `Original four-palisade defense should be 12 (${builtWalls.state.settlement.defense}).`);
    const targetId = builtWalls.state.structures[0].id;
    const targetBefore = builtWalls.state.structures.find(item => item.id === targetId);
    assert(targetBefore.type === 'palisade' && targetBefore.delivered.wood === 8 && targetBefore.workDone === 8, 'Target palisade is not a fully embodied 8-wood / 8-work wall.');

    const retrofitStart = await page.evaluate(targetId => {
      const v71 = window.realitySandboxRunevaleGatehouseRetrofitsV71;
      const api = window.realitySandboxRunevaleSettlementV68;
      const v69 = window.realitySandboxRunevaleCastlePerimetersV69;
      const beforeState = api.getState();
      const beforeStats = api.getStats();
      const validation = v71.validateGatehouseFootprint(targetId);
      const retrofit = v71.retrofitGatehouse(targetId);
      const state = api.getState();
      const completed = v69.getPerimeters({ completedOnly:true });
      const all = v69.getPerimeters({ completedOnly:false });
      return { validation, retrofit, beforeState, beforeStats, state, completed, all, v71:v71.getStats(), v68:api.getStats() };
    }, targetId);

    assert(retrofitStart.validation.ok && retrofitStart.validation.samples.length === 9, 'Gatehouse retrofit skipped exact 9-point physical footprint validation.');
    assert(retrofitStart.retrofit.ok, `Gatehouse retrofit request failed: ${retrofitStart.retrofit.reason || 'unknown'}.`);
    assert(retrofitStart.state.structures.length === 4, 'Gatehouse retrofit duplicated or deleted a fortification structure.');
    const upgrading = retrofitStart.state.structures.find(item => item.id === targetId);
    assert(upgrading.type === 'gatehouse', 'Target structure did not become a gatehouse retrofit in place.');
    assert(upgrading.id === targetId, 'Gatehouse retrofit did not preserve the original structure ID.');
    assert(upgrading.status !== 'complete', 'Gatehouse retrofit completed for free without delta materials/work.');
    assert(upgrading.required.wood === 12 && upgrading.required.stone === 8 && upgrading.workRequired === 18, 'Gatehouse total physical requirements are wrong.');
    assert(upgrading.delivered.wood === 8 && upgrading.delivered.stone === 0 && upgrading.workDone === 8, 'Retrofit failed to preserve exactly the embodied palisade material/work.');
    assert(upgrading.retrofit.deltaRequired.wood === 4 && upgrading.retrofit.deltaRequired.stone === 8 && upgrading.retrofit.deltaRequired.work === 10, 'Retrofit delta is not +4 wood / +8 stone / +10 work.');
    assert(retrofitStart.completed.closedCount === 0, 'Completed castle perimeter did not temporarily open while the gatehouse was under construction.');
    assert(retrofitStart.all.closedCount === 1 && retrofitStart.all.closed[0].gates === 1, 'Blueprint/construction graph did not preserve a closed perimeter with one gate edge during retrofit.');
    assert(retrofitStart.state.settlement.defense === 9, `Incomplete retrofit should temporarily remove the original wall defense, leaving 9 (${retrofitStart.state.settlement.defense}).`);
    assert(retrofitStart.v71.deltaRequired.wood === 4 && retrofitStart.v71.deltaRequired.stone === 8 && retrofitStart.v71.deltaRequired.work === 10, 'v71 public physical delta contract is wrong.');
    assert(retrofitStart.v71.sameStructureId && retrofitStart.v71.preservesEmbodiedMaterialsAndWork && retrofitStart.v71.usesV68Workers && retrofitStart.v71.usesV68Stockpile, 'v71 retrofit physical continuity contract is incomplete.');

    const stockBefore = { ...retrofitStart.state.settlement.stockpile };
    const statsBefore = { ...retrofitStart.v68 };
    let completed = null;
    for (let chunk = 0; chunk < 40; chunk++) {
      await page.evaluate(() => window.realitySandboxDebug.advance(60));
      completed = await page.evaluate(targetId => ({
        state:window.realitySandboxRunevaleSettlementV68.getState(),
        graph:window.realitySandboxRunevaleCastlePerimetersV69.getPerimeters({ completedOnly:true }),
        all:window.realitySandboxRunevaleCastlePerimetersV69.getPerimeters({ completedOnly:false }),
        v68:window.realitySandboxRunevaleSettlementV68.getStats(),
        v71:window.realitySandboxRunevaleGatehouseRetrofitsV71.getStats(),
        target:window.realitySandboxRunevaleSettlementV68.getState().structures.find(item => item.id === targetId),
      }), targetId);
      if (completed.target?.status === 'complete' && completed.graph.closedCount === 1) break;
    }

    assert(completed.target?.status === 'complete' && completed.target.type === 'gatehouse', 'Existing workers did not finish the gatehouse retrofit.');
    assert(completed.target.delivered.wood === 12 && completed.target.delivered.stone === 8 && completed.target.workDone === 18 && completed.target.progress === 1, 'Completed gatehouse does not contain its full physical material/work totals.');
    assert(completed.target.retrofit?.completed && Number.isFinite(completed.target.retrofit.completedAtStep), 'Gatehouse retrofit completion history was not persisted on the structure.');
    assert(completed.state.structures.length === 4, 'Retrofit changed castle structure count after completion.');
    assert(completed.graph.closedCount === 1 && completed.graph.closed[0].segments === 4 && completed.graph.closed[0].gates === 1, 'Completed castle did not close again with exactly one gate edge.');
    assert(completed.state.settlement.enclosedByCompletedFortifications === true && completed.state.settlement.derivedPerimeters === 1, 'Settlement did not regain its derived completed enclosure.');
    assert(completed.state.settlement.defense === 15, `Three palisades + one gatehouse should derive 15 defense (${completed.state.settlement.defense}).`);
    assert(completed.state.settlement.territoryRadius === 30, `Three palisades + one gatehouse should derive territory radius 30 (${completed.state.settlement.territoryRadius}).`);
    assert(Math.abs((stockBefore.wood - completed.state.settlement.stockpile.wood) - 4) < 1e-9, `Retrofit consumed something other than exactly 4 additional wood (${stockBefore.wood} -> ${completed.state.settlement.stockpile.wood}).`);
    assert(Math.abs((stockBefore.stone - completed.state.settlement.stockpile.stone) - 8) < 1e-9, `Retrofit consumed something other than exactly 8 stone (${stockBefore.stone} -> ${completed.state.settlement.stockpile.stone}).`);
    assert(completed.v68.materialHauls - statsBefore.materialHauls >= 3, 'Gatehouse delta materials were not physically hauled by the existing workers.');
    assert(completed.v68.constructionWorkTicks > statsBefore.constructionWorkTicks, 'Gatehouse delta work was not physically performed over simulation steps.');
    assert(completed.v68.structureRetrofitsStarted === 1 && completed.v68.structureRetrofitsCompleted === 1, 'Authoritative v68 retrofit accounting is not exactly one started/one completed.');
    assert(completed.v71.noFreeReplacement && completed.v71.noHardRetrofitCap && completed.v71.noHardBuildingCap && completed.v71.noHardPopulationCap && completed.v71.noHardDisplayCap, 'v71 introduced free replacement or an arbitrary cap.');

    // Give the v68 periodic persistence save a few extra fixed steps, then verify
    // the same physical structure survives a page reload as the completed gate.
    await page.evaluate(() => window.realitySandboxDebug.advance(60));
    await page.reload({ waitUntil:'domcontentloaded', timeout:120000 });
    await page.waitForFunction(() => window.realitySandboxRunevaleGatehouseRetrofitsV71?.installed, null, { timeout:120000 });
    const restored = await page.evaluate(targetId => ({
      state:window.realitySandboxRunevaleSettlementV68.getState(),
      graph:window.realitySandboxRunevaleCastlePerimetersV69.getPerimeters({ completedOnly:true }),
      target:window.realitySandboxRunevaleSettlementV68.getState().structures.find(item => item.id === targetId),
      ui:Boolean(document.querySelector('#runevaleSettlementHudV68 .runevale-v71-gatehouse-retrofit')),
      dataset:document.documentElement.dataset.runevaleGatehouseRetrofitsV71,
      build:window.realitySandboxEvolutionBuild,
    }), targetId);
    assert(restored.target?.id === targetId && restored.target.type === 'gatehouse' && restored.target.status === 'complete', 'Completed gatehouse retrofit did not persist across reload under the original structure ID.');
    assert(restored.graph.closedCount === 1 && restored.graph.closed[0].gates === 1, 'Persisted castle no longer derives its one-gate closed perimeter.');
    assert(restored.ui, 'Gatehouse retrofit control is missing from the build HUD.');
    assert(restored.dataset === 'physical-delta-gatehouse-upgrades', 'v71 runtime dataset marker is missing.');
    assert(restored.build === 'evolution-v67-distributed-multistep-planning', `v71 gameplay incorrectly replaced evolution build ${restored.build}.`);
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'runevale-gatehouse-retrofits-v71.json'), JSON.stringify({ site, harvest, founded, walls, builtWalls, targetId, retrofitStart, stockBefore, statsBefore, completed, restored, pageErrors }, null, 2));
    await page.screenshot({ path:path.join(artifactDir, 'runevale-gatehouse-retrofits-v71.png'), fullPage:true });
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
