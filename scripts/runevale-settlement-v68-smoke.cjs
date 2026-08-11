const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_RUNEVALE_V68_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'runevale-settlement-v68-smoke');
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
      window.realitySandboxSurfaceMode?.enterAt &&
      window.realitySandboxRunevaleSettlementV68?.installed &&
      window.realitySandboxPlanet?.world?.ecs?.components?.resource?.size > 0
    ), null, { timeout:120000 });

    await page.evaluate(() => window.realitySandboxRunevaleSettlementV68.resetForTest());

    const firstPatch = await page.evaluate(() => {
      const planet = window.realitySandboxPlanet;
      const c = planet.world.ecs.components;
      for (const [id, item] of c.resource.entries()) {
        const p = c.position.get(id);
        const terrain = p && planet.living.sampleDynamicPlanet(p.x, p.y);
        if (p && terrain?.land && Number(item.amount) > 0.18) return { id, x:p.x, y:p.y, amount:Number(item.amount) };
      }
      return null;
    });
    assert(firstPatch, 'No embodied ecological vegetation patch was available for v68 wood harvesting.');

    await page.evaluate(p => window.realitySandboxSurfaceMode.enterAt(p.x, p.y), firstPatch);
    await page.waitForFunction(() => document.documentElement.dataset.surfaceMode === 'active', null, { timeout:30000 });

    const woodDebit = await page.evaluate(() => {
      const api = window.realitySandboxRunevaleSettlementV68;
      const planet = window.realitySandboxPlanet;
      const c = planet.world.ecs.components;
      const player = window.realitySandboxSurfaceMode.getPlayer();
      let before = null;
      let nearest = null;
      for (const [id, item] of c.resource.entries()) {
        const p = c.position.get(id);
        if (!p || Number(item.amount) <= 0.015) continue;
        let dx = p.x - player.x;
        if (dx > planet.world.width * 0.5) dx -= planet.world.width;
        else if (dx < -planet.world.width * 0.5) dx += planet.world.width;
        const d = Math.hypot(dx, p.y - player.y);
        if (d <= 16 && (!nearest || d < nearest.d)) nearest = { id, d, amount:Number(item.amount) };
      }
      if (nearest) before = nearest.amount;
      const result = api.gatherWood();
      const after = result.ok ? Number(c.resource.get(result.resourceId)?.amount) : null;
      return { before, after, result, state:api.getState(), stats:api.getStats() };
    });
    assert(woodDebit.result.ok, `Real ecological wood harvest failed: ${woodDebit.result.reason || 'unknown'}.`);
    assert(woodDebit.result.ecologicalDebit > 0, 'Wood harvest recorded no ecological debit.');
    assert(woodDebit.after < woodDebit.before, `Ecological resource amount did not decrease (${woodDebit.before} -> ${woodDebit.after}).`);
    assert(Math.abs((woodDebit.before - woodDebit.after) - woodDebit.result.ecologicalDebit) < 1e-9, 'Wood harvest debit did not match the actual resource-entity amount change.');

    const firstStone = await page.evaluate(() => {
      const api = window.realitySandboxRunevaleSettlementV68;
      const one = api.gatherStone();
      const afterOne = api.getState();
      const two = api.gatherStone();
      const afterTwo = api.getState();
      return { one, two, afterOne, afterTwo };
    });
    assert(firstStone.one.ok && firstStone.two.ok, 'Finite local stone quarrying failed.');
    const stoneKey = Object.keys(firstStone.afterOne.stoneCells)[0];
    assert(stoneKey, 'Stone quarry did not create a local terrain reserve record.');
    assert(firstStone.afterTwo.stoneCells[stoneKey].remaining === firstStone.afterOne.stoneCells[stoneKey].remaining - firstStone.two.stone, 'Second quarry action did not deplete the same local stone reserve.');

    // Harvest across real ecological patches until enough physical material exists
    // for a palisade, house, and watch tower. No stockpile is injected by the test.
    const harvest = await page.evaluate(async () => {
      const api = window.realitySandboxRunevaleSettlementV68;
      const surface = window.realitySandboxSurfaceMode;
      const planet = window.realitySandboxPlanet;
      const c = planet.world.ecs.components;
      const usable = [...c.resource.entries()]
        .map(([id, item]) => ({ id, item, p:c.position.get(id) }))
        .filter(entry => entry.p && Number(entry.item.amount) > 0.12 && planet.living.sampleDynamicPlanet(entry.p.x, entry.p.y)?.land)
        .slice(0, 18);
      const events = [];
      for (const entry of usable) {
        surface.enterAt(entry.p.x, entry.p.y);
        const wood = api.gatherWood();
        const stone = api.gatherStone();
        events.push({ id:entry.id, wood, stone });
        const pack = api.getState().playerPack;
        if (pack.wood >= 52 && pack.stone >= 30) break;
      }
      return { events, state:api.getState(), stats:api.getStats() };
    });
    assert(harvest.state.playerPack.wood >= 28, `Too little physically harvested wood for construction (${harvest.state.playerPack.wood}).`);
    assert(harvest.state.playerPack.stone >= 14, `Too little physically quarried stone for construction (${harvest.state.playerPack.stone}).`);
    assert(harvest.stats.woodHarvestEvents >= 2 && harvest.stats.stoneHarvestEvents >= 2, 'Construction stockpile did not come from repeated physical local harvests.');

    const founded = await page.evaluate(() => {
      const api = window.realitySandboxRunevaleSettlementV68;
      const result = api.foundSettlement('Testmarch');
      return { result, state:api.getState(), stats:api.getStats() };
    });
    assert(founded.result.ok, `Settlement founding failed: ${founded.result.reason || 'unknown'}.`);
    assert(founded.state.settlement.name === 'Testmarch', 'Settlement name did not persist into simulation state.');
    assert(/^House /.test(founded.state.settlement.houseName), 'Founding did not derive an original house identity.');
    assert(founded.state.workers.length === 2, `Expected two founding settlers, got ${founded.state.workers.length}.`);

    const placements = await page.evaluate(() => {
      const api = window.realitySandboxRunevaleSettlementV68;
      const palisade = api.placeBlueprint('palisade', 10);
      const house = api.placeBlueprint('house', 22);
      const tower = api.placeBlueprint('tower', 34);
      return { palisade, house, tower, state:api.getState() };
    });
    assert(placements.palisade.ok, `Palisade placement failed: ${placements.palisade.reason || 'unknown'}.`);
    assert(placements.house.ok, `House placement failed: ${placements.house.reason || 'unknown'}.`);
    // Tower is allowed to remain a blueprint waiting for more stone, but placement itself must work.
    assert(placements.tower.ok, `Tower placement failed: ${placements.tower.reason || 'unknown'}.`);
    assert(placements.state.structures.length === 3, 'Expected three uncapped v68 structure records.');

    const built = await advanceUntil(page, async () => {
      return page.evaluate(() => {
        const api = window.realitySandboxRunevaleSettlementV68;
        const state = api.getState();
        const stats = api.getStats();
        const complete = state.structures.filter(item => item.status === 'complete');
        return { state, stats, complete };
      });
    }, state => state.complete.some(item => item.type === 'palisade') && state.complete.some(item => item.type === 'house'), 'Worker-hauled palisade + house construction', 30, 60);

    const palisade = built.state.structures.find(item => item.type === 'palisade');
    const house = built.state.structures.find(item => item.type === 'house');
    assert(palisade.delivered.wood >= palisade.required.wood && palisade.progress === 1, 'Palisade completed without fully delivered wood.');
    assert(house.delivered.wood >= house.required.wood && house.delivered.stone >= house.required.stone && house.progress === 1, 'House completed without fully delivered materials.');
    assert(built.stats.materialHauls > 0 && built.stats.constructionWorkTicks > 0, 'Workers did not physically haul materials and perform construction work.');
    assert(built.state.settlement.defense >= 3, `Completed fortification did not create derived defense (${built.state.settlement.defense}).`);
    assert(built.state.settlement.housing >= 6, `Completed house did not create physical housing capacity (${built.state.settlement.housing}).`);
    assert(built.state.settlement.territoryRadius > 24, 'Built infrastructure did not expand settlement territory.');

    await page.waitForTimeout(650);
    const presentation = await page.evaluate(() => ({
      stats:window.realitySandboxRunevaleSettlementV68.getStats(),
      overlayPresent:Boolean(document.getElementById('runevaleSettlementCanvasV68')),
      hudPresent:Boolean(document.getElementById('runevaleSettlementHudV68')),
      dataset:document.documentElement.dataset.runevaleSettlementV68,
      bridge:document.documentElement.dataset.runevaleNysaBridge,
      evolutionBuild:window.realitySandboxEvolutionBuild,
    }));
    assert(presentation.overlayPresent && presentation.hudPresent, 'Runevale castle layer is not attached to the playable surface view.');
    assert(presentation.stats.renderedStructures >= 1, 'Completed/constructing structures were not rendered into surface mode.');
    assert(presentation.stats.renderedWorkers >= 1, 'Physical settlement workers were not rendered into surface mode.');
    assert(presentation.stats.structuresPersistByWorldSeed, 'v68 persistence contract is inactive.');
    assert(presentation.stats.noHardBuildingCap && presentation.stats.noHardPopulationCap && presentation.stats.noHardDisplayCap, 'v68 introduced an arbitrary building/population/display cap.');
    assert(presentation.stats.authoritativeFixedStep, 'v68 construction is not on the authoritative fixed-step simulation clock.');
    assert(presentation.stats.originalRunevaleSourceImported === false, 'v68 falsely claims the hosted Runevale source was imported.');
    assert(presentation.dataset === 'surface-castle-foundation' && presentation.bridge === 'v68-settlement-foundation', 'v68 runtime dataset markers are missing.');
    assert(presentation.evolutionBuild === 'evolution-v67-distributed-multistep-planning', `Gameplay v68 incorrectly replaced the evolution build marker (${presentation.evolutionBuild}).`);

    await page.screenshot({ path:path.join(artifactDir, 'runevale-settlement-v68.png'), fullPage:true });
    fs.writeFileSync(path.join(artifactDir, 'runevale-settlement-v68.json'), JSON.stringify({ firstPatch, woodDebit, firstStone, harvest, founded, placements, built, presentation, pageErrors }, null, 2));

    const beforeReload = built.state;
    await page.reload({ waitUntil:'domcontentloaded', timeout:120000 });
    await page.waitForFunction(() => window.realitySandboxRunevaleSettlementV68?.installed, null, { timeout:120000 });
    const restored = await page.evaluate(() => window.realitySandboxRunevaleSettlementV68.getState());
    assert(restored.settlement?.name === beforeReload.settlement.name, 'Settlement did not persist across page reload for the same world seed.');
    assert(restored.structures.length === beforeReload.structures.length, 'Structure count did not persist across page reload.');
    assert(restored.structures.filter(item => item.status === 'complete').length >= 2, 'Completed castle structures did not persist across reload.');
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'runevale-settlement-v68-restored.json'), JSON.stringify({ restored, pageErrors }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  fs.writeFileSync(path.join(artifactDir, 'fatal-error.txt'), `${error.stack || error.message}\n`);
  console.error(error);
  process.exitCode = 1;
});

async function advanceUntil(page, readSnapshot, ready, label, maxChunks = 20, ticksPerChunk = 60) {
  let snapshot = null;
  for (let chunk = 0; chunk < maxChunks; chunk++) {
    await page.evaluate(ticks => window.realitySandboxDebug.advance(ticks), ticksPerChunk);
    snapshot = await readSnapshot();
    if (ready(snapshot)) return snapshot;
  }
  throw new Error(`${label} did not occur. ${JSON.stringify(snapshot)}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
