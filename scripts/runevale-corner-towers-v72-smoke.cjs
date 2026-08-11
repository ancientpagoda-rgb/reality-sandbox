const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_RUNEVALE_V72_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'runevale-corner-towers-v72-smoke');
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
      typeof window.realitySandboxRunevaleSettlementV68?.placeJunctionTower === 'function' &&
      window.realitySandboxRunevaleCastlePerimetersV69?.installed &&
      window.realitySandboxRunevaleGatehouseRetrofitsV71?.installed &&
      window.realitySandboxRunevaleCornerTowersV72?.installed
    ), null, { timeout:120000 });

    await page.evaluate(() => window.realitySandboxRunevaleSettlementV68.resetForTest());

    // Find a real site supporting an east-west two-segment wall, a north-south
    // branch at its western endpoint, and the 4.2x4.2 physical tower footprint.
    const site = await page.evaluate(() => {
      const planet = window.realitySandboxPlanet;
      const v69 = window.realitySandboxRunevaleCastlePerimetersV69;
      const c = planet.world.ecs.components;
      for (const p of [...c.position.values()].slice(0, 320)) {
        const x = p.x;
        const y = p.y;
        if (x < 28 || x > planet.world.width - 28 || y < 28 || y > planet.world.height - 28) continue;
        const center = planet.living.sampleDynamicPlanet(x, y, 'v72-site-center');
        const water = planet.waterCycle.sample(x, y, 'v72-site-center');
        if (!center?.land || Number(water?.lake || 0) > 0.45) continue;
        const first = v69.validateAt('palisade', x + 4, y, -Math.PI * 0.5);
        const straight = v69.validateAt('palisade', x + 12, y, -Math.PI * 0.5);
        const branch = v69.validateAt('palisade', x, y + 4, 0);
        const tower = v69.validateAt('tower', x, y, 0);
        if (first.ok && straight.ok && branch.ok && tower.ok) return { x, y, first, straight, branch, tower };
      }
      return null;
    });
    assert(site, 'No real terrain site supports the v72 L-corner + straight-junction tower proof.');

    // Physically harvest all construction resources: 3 palisades = 24 wood;
    // standard tower = +8 wood / +12 stone.
    const harvest = await page.evaluate(() => {
      const api = window.realitySandboxRunevaleSettlementV68;
      const surface = window.realitySandboxSurfaceMode;
      const planet = window.realitySandboxPlanet;
      const c = planet.world.ecs.components;
      const events = [];
      const resources = [...c.resource.entries()]
        .map(([id, item]) => ({ id, item, p:c.position.get(id) }))
        .filter(entry => entry.p && Number(entry.item.amount) > 0.12 && planet.living.sampleDynamicPlanet(entry.p.x, entry.p.y, 'v72-harvest-find')?.land)
        .slice(0, 42);
      for (const entry of resources) {
        surface.enterAt(entry.p.x, entry.p.y);
        const wood = api.gatherWood();
        const stone = api.gatherStone();
        events.push({ id:entry.id, wood, stone });
        const pack = api.getState().playerPack;
        if (pack.wood >= 40 && pack.stone >= 16) break;
      }
      return { events, state:api.getState(), stats:api.getStats() };
    });
    assert(harvest.state.playerPack.wood >= 32, `Physical harvest did not provide 3 walls + tower wood (${harvest.state.playerPack.wood}).`);
    assert(harvest.state.playerPack.stone >= 12, `Physical quarrying did not provide tower stone (${harvest.state.playerPack.stone}).`);
    assert(harvest.stats.ecologicalResourceDebited > 0 && harvest.stats.stoneReserveDebited >= 12, 'Tower resources are not grounded in ecological/stone depletion.');

    const founded = await page.evaluate(({ x, y }) => {
      window.realitySandboxSurfaceMode.enterAt(x, y);
      return window.realitySandboxRunevaleSettlementV68.foundSettlement('Cornerwatch');
    }, site);
    assert(founded.ok, `Corner-tower settlement founding failed: ${founded.reason || 'unknown'}.`);

    const walls = await page.evaluate(({ x, y }) => {
      const v69 = window.realitySandboxRunevaleCastlePerimetersV69;
      const results = [
        v69.placeAt('palisade', x + 4, y, -Math.PI * 0.5, { snap:false }),
        v69.placeAt('palisade', x + 12, y, -Math.PI * 0.5, { snap:false }),
        v69.placeAt('palisade', x, y + 4, 0, { snap:false }),
      ];
      return {
        results,
        state:window.realitySandboxRunevaleSettlementV68.getState(),
        graph:v69.getPerimeters({ completedOnly:false }),
      };
    }, site);
    assert(walls.results.every(result => result.ok), `One or more v72 proof walls failed placement: ${walls.results.map(result => result.reason || 'ok').join(' | ')}`);
    assert(walls.state.structures.length === 3, 'The initial L + straight extension is not exactly three wall structures.');

    let builtWalls = null;
    for (let chunk = 0; chunk < 45; chunk++) {
      await page.evaluate(() => window.realitySandboxDebug.advance(60));
      builtWalls = await page.evaluate(() => ({
        state:window.realitySandboxRunevaleSettlementV68.getState(),
        graph:window.realitySandboxRunevaleCastlePerimetersV69.getPerimeters({ completedOnly:true }),
        v68:window.realitySandboxRunevaleSettlementV68.getStats(),
        junctions:window.realitySandboxRunevaleCornerTowersV72.getJunctions(),
        corners:window.realitySandboxRunevaleCornerTowersV72.getCornerJunctions(),
      }));
      if (builtWalls.state.structures.every(item => item.status === 'complete')) break;
    }
    assert(builtWalls.state.structures.every(item => item.status === 'complete'), 'Workers did not physically complete all three junction-test walls.');
    assert(builtWalls.graph.totalLinearSegments === 3, `v69 does not see the three completed wall edges (${builtWalls.graph.totalLinearSegments}).`);
    assert(builtWalls.state.settlement.defense === 9, `Three completed palisades should derive defense 9 (${builtWalls.state.settlement.defense}).`);

    const straightJunction = builtWalls.junctions.find(item => !item.isCorner && item.degree === 2);
    const cornerJunction = builtWalls.junctions.find(item => item.isCorner && item.degree === 2);
    assert(straightJunction, 'v72 did not derive the degree-2 straight wall continuation.');
    assert(cornerJunction, 'v72 did not derive the real degree-2 wall corner.');
    assert(straightJunction.turnAngle < 0.1, `Straight continuation has unexpected turn angle ${straightJunction.turnAngle}.`);
    assert(Math.abs(cornerJunction.interiorAngle - Math.PI * 0.5) < 0.12, `Derived corner is not approximately 90 degrees (${cornerJunction.interiorAngle}).`);
    assert(builtWalls.corners.length === 1, `v72 should expose exactly one tower-eligible corner, got ${builtWalls.corners.length}.`);

    // Both the public v72 layer and the authoritative v68 seam must reject the
    // straight continuation, so the restriction cannot be bypassed by UI logic.
    const straightRejected = await page.evaluate(junction => ({
      publicResult:window.realitySandboxRunevaleCornerTowersV72.validateCornerTower(junction.nodeId),
      authoritativeResult:window.realitySandboxRunevaleSettlementV68.placeJunctionTower(junction.x, junction.y, junction.wallIds),
      state:window.realitySandboxRunevaleSettlementV68.getState(),
    }), straightJunction);
    assert(!straightRejected.publicResult.ok, 'v72 incorrectly treats a straight continuation as a tower corner.');
    assert(!straightRejected.authoritativeResult.ok, 'Authoritative v68 seam allowed a tower on a straight continuation.');
    assert(straightRejected.state.structures.length === 3, 'Straight-junction rejection mutated the physical structure list.');

    const towerValidation = await page.evaluate(nodeId => window.realitySandboxRunevaleCornerTowersV72.validateCornerTower(nodeId), cornerJunction.nodeId);
    assert(towerValidation.ok, `Real wall corner failed tower footprint validation: ${towerValidation.reason || 'unknown'}.`);
    assert(towerValidation.samples.length === 9, `Corner tower did not use 9 exact physical footprint samples (${towerValidation.samples.length}).`);

    const beforeTower = await page.evaluate(() => ({
      state:window.realitySandboxRunevaleSettlementV68.getState(),
      v68:window.realitySandboxRunevaleSettlementV68.getStats(),
      v72:window.realitySandboxRunevaleCornerTowersV72.getStats(),
    }));
    const stockBefore = { ...beforeTower.state.settlement.stockpile };
    const statsBefore = { ...beforeTower.v68 };

    const towerStart = await page.evaluate(nodeId => {
      const v72 = window.realitySandboxRunevaleCornerTowersV72;
      const result = v72.buildCornerTower(nodeId);
      return {
        result,
        state:window.realitySandboxRunevaleSettlementV68.getState(),
        graph:window.realitySandboxRunevaleCastlePerimetersV69.getPerimeters({ completedOnly:true }),
        junctions:v72.getJunctions(),
        stats:v72.getStats(),
      };
    }, cornerJunction.nodeId);
    assert(towerStart.result.ok, `Physical corner tower blueprint failed: ${towerStart.result.reason || 'unknown'}.`);
    assert(towerStart.state.structures.length === 4, 'Corner tower did not add exactly one standard physical structure.');
    const towerId = towerStart.result.structure.id;
    const towerBlueprint = towerStart.state.structures.find(item => item.id === towerId);
    assert(towerBlueprint?.type === 'tower' && towerBlueprint.status !== 'complete', 'Junction tower is not a normal incomplete v68 tower blueprint.');
    assert(towerBlueprint.required.wood === 8 && towerBlueprint.required.stone === 12 && towerBlueprint.workRequired === 18, 'Corner tower does not use standard v68 tower requirements.');
    assert(towerBlueprint.delivered.wood === 0 && towerBlueprint.delivered.stone === 0 && towerBlueprint.workDone === 0, 'Corner tower began with free material or work.');
    assert(towerStart.graph.totalLinearSegments === 3, 'Adding a tower mutated or replaced the underlying wall graph.');
    const duringCorner = towerStart.junctions.find(item => item.nodeId === cornerJunction.nodeId);
    assert(duringCorner?.towerId === towerId && duringCorner.towerStatus !== 'complete' && !duringCorner.reinforced, 'Derived corner does not see the in-progress physical tower.');

    let completed = null;
    for (let chunk = 0; chunk < 45; chunk++) {
      await page.evaluate(() => window.realitySandboxDebug.advance(60));
      completed = await page.evaluate(({ towerId, cornerNodeId }) => ({
        state:window.realitySandboxRunevaleSettlementV68.getState(),
        graph:window.realitySandboxRunevaleCastlePerimetersV69.getPerimeters({ completedOnly:true }),
        tower:window.realitySandboxRunevaleSettlementV68.getState().structures.find(item => item.id === towerId),
        corner:window.realitySandboxRunevaleCornerTowersV72.getJunctions().find(item => item.nodeId === cornerNodeId),
        v68:window.realitySandboxRunevaleSettlementV68.getStats(),
        v72:window.realitySandboxRunevaleCornerTowersV72.getStats(),
      }), { towerId, cornerNodeId:cornerJunction.nodeId });
      if (completed.tower?.status === 'complete') break;
    }

    assert(completed.tower?.status === 'complete', 'Existing v68 workers did not finish the physical corner tower.');
    assert(completed.tower.delivered.wood === 8 && completed.tower.delivered.stone === 12 && completed.tower.workDone === 18 && completed.tower.progress === 1, 'Completed corner tower does not contain exact standard material/work totals.');
    assert(completed.graph.totalLinearSegments === 3, 'Completed tower altered the three underlying wall edges.');
    assert(completed.corner?.towerId === towerId && completed.corner.reinforced && completed.corner.towerStatus === 'complete', 'Corner reinforcement is not derived from the completed physical tower.');
    assert(completed.state.settlement.defense === 17, `Three palisades + one tower should derive defense 17 (${completed.state.settlement.defense}).`);
    assert(completed.state.settlement.territoryRadius === 31, `Three palisades + one tower should derive territory 31 (${completed.state.settlement.territoryRadius}).`);
    assert(Math.abs((stockBefore.wood - completed.state.settlement.stockpile.wood) - 8) < 1e-9, `Corner tower consumed something other than exactly 8 wood (${stockBefore.wood} -> ${completed.state.settlement.stockpile.wood}).`);
    assert(Math.abs((stockBefore.stone - completed.state.settlement.stockpile.stone) - 12) < 1e-9, `Corner tower consumed something other than exactly 12 stone (${stockBefore.stone} -> ${completed.state.settlement.stockpile.stone}).`);
    assert(completed.v68.materialHauls - statsBefore.materialHauls >= 4, 'Corner-tower materials were not physically hauled by v68 workers.');
    assert(completed.v68.constructionWorkTicks > statsBefore.constructionWorkTicks, 'Corner-tower work was not performed over v68 fixed steps.');
    assert(completed.v72.buildAccepted === 1 && completed.v72.straightJunctionRejections >= 1, 'v72 corner/straight accounting is incorrect.');
    assert(completed.v72.usesV68StandardTowerBlueprint && completed.v72.usesV68WorkersAndStockpile && completed.v72.wallEdgesRemainIntact, 'v72 bypassed the physical v68/v69 construction stack.');
    assert(completed.v72.noStoredJunctionId && completed.v72.noStoredWallMembership && completed.v72.noHardCornerTowerCap && completed.v72.noHardBuildingCap, 'v72 stores scripted junction membership or introduces a hard cap.');

    for (const forbidden of ['junctionId','nodeId','cornerId','wallIds','adjacentStructureIds','fortificationIds','wallGroupId']) {
      assert(!(forbidden in completed.tower), `Tower ${towerId} stores forbidden derived-junction membership field ${forbidden}.`);
    }

    // Persist, reload, and re-derive the reinforcement solely from wall graph +
    // physical tower proximity. No junction identity is stored in the tower.
    await page.evaluate(() => window.realitySandboxDebug.advance(60));
    await page.reload({ waitUntil:'domcontentloaded', timeout:120000 });
    await page.waitForFunction(() => window.realitySandboxRunevaleCornerTowersV72?.installed, null, { timeout:120000 });
    const restored = await page.evaluate(({ towerId, x, y }) => {
      const state = window.realitySandboxRunevaleSettlementV68.getState();
      const junctions = window.realitySandboxRunevaleCornerTowersV72.getJunctions();
      const near = junctions.find(item => Math.hypot(item.x - x, item.y - y) < 1.5);
      return {
        tower:state.structures.find(item => item.id === towerId),
        junction:near,
        graph:window.realitySandboxRunevaleCastlePerimetersV69.getPerimeters({ completedOnly:true }),
        ui:Boolean(document.querySelector('#runevaleSettlementHudV68 .runevale-v72-corner-tower')),
        dataset:document.documentElement.dataset.runevaleCornerTowersV72,
        build:window.realitySandboxEvolutionBuild,
      };
    }, { towerId, x:cornerJunction.x, y:cornerJunction.y });
    assert(restored.tower?.id === towerId && restored.tower.type === 'tower' && restored.tower.status === 'complete', 'Physical corner tower did not persist across reload.');
    assert(restored.junction?.reinforced && restored.junction.towerId === towerId, 'Reload did not re-derive the tower-reinforced corner.');
    assert(restored.graph.totalLinearSegments === 3, 'Persisted tower changed the wall graph.');
    assert(restored.ui, 'Corner-tower control is missing from the build HUD.');
    assert(restored.dataset === 'derived-physical-corner-towers', 'v72 runtime dataset marker is missing.');
    assert(restored.build === 'evolution-v67-distributed-multistep-planning', `v72 gameplay incorrectly replaced evolution build ${restored.build}.`);
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'runevale-corner-towers-v72.json'), JSON.stringify({ site, harvest, founded, walls, builtWalls, straightJunction, cornerJunction, straightRejected, towerValidation, beforeTower, towerStart, stockBefore, statsBefore, completed, restored, pageErrors }, null, 2));
    await page.screenshot({ path:path.join(artifactDir, 'runevale-corner-towers-v72.png'), fullPage:true });
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
