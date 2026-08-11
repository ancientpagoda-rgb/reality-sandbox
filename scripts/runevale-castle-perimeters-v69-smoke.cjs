const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_RUNEVALE_V69_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'runevale-castle-perimeters-v69-smoke');
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
      window.realitySandboxRunevaleBuildOrientationV68b?.installed &&
      window.realitySandboxRunevaleCastlePerimetersV69?.installed
    ), null, { timeout:120000 });

    await page.evaluate(() => window.realitySandboxRunevaleSettlementV68.resetForTest());

    const shoreline = await page.evaluate(() => {
      const planet = window.realitySandboxPlanet;
      const v69 = window.realitySandboxRunevaleCastlePerimetersV69;
      const c = planet.world.ecs.components;
      const candidates = [...c.position.values()].slice(0, 180);
      for (const p of candidates) {
        const center = planet.living.sampleDynamicPlanet(p.x, p.y, 'v69-shore-center');
        const water = planet.waterCycle.sample(p.x, p.y, 'v69-shore-center');
        if (!center?.land || Number(water?.lake || 0) > 0.45) continue;
        for (const yaw of [0, Math.PI * 0.5, Math.PI * 0.25, -Math.PI * 0.25]) {
          const check = v69.validateAt('palisade', p.x, p.y, yaw);
          if (!check.ok && check.samples?.some(sample => !sample.land || sample.lake > 0.45)) {
            return { x:p.x, y:p.y, yaw, centerLand:center.land, centerLake:Number(water?.lake || 0), check };
          }
        }
      }
      // Fallback coarse deterministic search if ecological entity centers happen
      // not to sit close enough to a shoreline for an 8-unit wall footprint.
      for (let y = 8; y < planet.world.height - 8; y += 10) {
        for (let x = 8; x < planet.world.width; x += 10) {
          const center = planet.living.sampleDynamicPlanet(x, y, 'v69-shore-grid');
          const water = planet.waterCycle.sample(x, y, 'v69-shore-grid');
          if (!center?.land || Number(water?.lake || 0) > 0.45) continue;
          for (const yaw of [0, Math.PI * 0.5]) {
            const check = v69.validateAt('palisade', x, y, yaw);
            if (!check.ok && check.samples?.some(sample => !sample.land || sample.lake > 0.45)) {
              return { x, y, yaw, centerLand:center.land, centerLake:Number(water?.lake || 0), check };
            }
          }
        }
      }
      return null;
    });
    assert(shoreline, 'Could not find a center-dry placement whose physical wall footprint crosses shoreline/water.');
    assert(shoreline.centerLand && shoreline.centerLake <= 0.45, 'Shoreline proof center itself is not valid dry land.');
    assert(!shoreline.check.ok && shoreline.check.footprintDry === false, 'v69 failed to reject a wall whose footprint crosses shoreline/water.');
    assert(shoreline.check.samples.length === 9, `v69 footprint did not use 9 samples (${shoreline.check.samples.length}).`);

    // Find a genuinely flat/dry 8x8 square footprint suitable for a closed
    // four-wall palisade. We derive this from real simulation terrain.
    const site = await page.evaluate(() => {
      const planet = window.realitySandboxPlanet;
      const v69 = window.realitySandboxRunevaleCastlePerimetersV69;
      const c = planet.world.ecs.components;
      const candidates = [...c.position.values()].slice(0, 240);
      const wrap = value => ((value % planet.world.width) + planet.world.width) % planet.world.width;
      for (const p of candidates) {
        const x = p.x;
        const y = p.y;
        const checks = [
          v69.validateAt('palisade', x, y - 4, -Math.PI * 0.5),
          v69.validateAt('palisade', wrap(x + 4), y, 0),
          v69.validateAt('palisade', x, y + 4, -Math.PI * 0.5),
          v69.validateAt('palisade', wrap(x - 4), y, 0),
        ];
        const center = planet.living.sampleDynamicPlanet(x, y, 'v69-site-center');
        const water = planet.waterCycle.sample(x, y, 'v69-site-center');
        if (center?.land && Number(water?.lake || 0) <= 0.45 && checks.every(check => check.ok)) return { x, y, checks };
      }
      return null;
    });
    assert(site, 'No flat/dry physical site was found for the deterministic four-wall enclosure proof.');

    // Physically harvest enough ecological biomass for four 8-wood palisade
    // segments. No test-only stockpile injection is used.
    const harvest = await page.evaluate(() => {
      const api = window.realitySandboxRunevaleSettlementV68;
      const surface = window.realitySandboxSurfaceMode;
      const planet = window.realitySandboxPlanet;
      const c = planet.world.ecs.components;
      const events = [];
      const resources = [...c.resource.entries()]
        .map(([id, item]) => ({ id, item, p:c.position.get(id) }))
        .filter(entry => entry.p && Number(entry.item.amount) > 0.12 && planet.living.sampleDynamicPlanet(entry.p.x, entry.p.y, 'v69-harvest-find')?.land)
        .slice(0, 30);
      for (const entry of resources) {
        surface.enterAt(entry.p.x, entry.p.y);
        const result = api.gatherWood();
        events.push({ id:entry.id, result });
        if (api.getState().playerPack.wood >= 38) break;
      }
      return { events, state:api.getState(), stats:api.getStats() };
    });
    assert(harvest.state.playerPack.wood >= 32, `Physical harvesting did not produce four-wall material (${harvest.state.playerPack.wood}).`);
    assert(harvest.stats.ecologicalResourceDebited > 0 && harvest.stats.woodHarvestEvents >= 4, 'Wall material was not grounded in repeated ecological biomass harvesting.');

    const founded = await page.evaluate(({ x, y }) => {
      const surface = window.realitySandboxSurfaceMode;
      const api = window.realitySandboxRunevaleSettlementV68;
      surface.enterAt(x, y);
      return api.foundSettlement('Ringwatch');
    }, site);
    assert(founded.ok, `Enclosure settlement founding failed: ${founded.reason || 'unknown'}.`);

    // First segment exact. The next three are intentionally offset slightly;
    // endpoint snapping must pull them into exact straight/corner connections.
    const placed = await page.evaluate(({ x, y }) => {
      const v69 = window.realitySandboxRunevaleCastlePerimetersV69;
      const w = window.realitySandboxPlanet.world.width;
      const wrap = value => ((value % w) + w) % w;
      const first = v69.placeAt('palisade', x, y - 4, -Math.PI * 0.5, { snap:false });
      const right = v69.placeAt('palisade', wrap(x + 4.75), y + 0.35, 0.08, { snap:true });
      const bottom = v69.placeAt('palisade', x + 0.30, y + 4.72, -Math.PI * 0.5 + 0.07, { snap:true });
      const left = v69.placeAt('palisade', wrap(x - 4.68), y - 0.24, -0.06, { snap:true });
      return {
        first,
        right,
        bottom,
        left,
        endpoints:v69.getEndpoints(),
        perimeter:v69.getPerimeters({ completedOnly:false }),
        state:window.realitySandboxRunevaleSettlementV68.getState(),
        stats:v69.getStats(),
      };
    }, site);

    for (const [name, result] of Object.entries({ first:placed.first, right:placed.right, bottom:placed.bottom, left:placed.left })) {
      assert(result.ok, `${name} wall placement failed: ${result.reason || 'unknown'}.`);
      assert(result.validation?.samples?.length === 9, `${name} wall skipped full-footprint validation.`);
    }
    assert(!placed.first.snapped, 'First wall unexpectedly snapped without an existing endpoint.');
    assert(placed.right.snapped && placed.right.snap?.kind === 'corner', 'Second wall did not corner-snap to the first wall endpoint.');
    assert(placed.bottom.snapped && placed.bottom.snap?.kind === 'corner', 'Third wall did not corner-snap to the second wall endpoint.');
    assert(placed.left.snapped && placed.left.snap?.kind === 'corner', 'Fourth wall did not corner-snap to the third wall endpoint.');
    assert(placed.perimeter.closedCount === 1, `Four snapped blueprint walls did not derive one closed perimeter (${placed.perimeter.closedCount}).`);
    assert(placed.perimeter.closed[0]?.segments === 4, `Derived enclosure does not contain exactly four wall segments (${placed.perimeter.closed[0]?.segments}).`);
    assert(placed.perimeter.closed[0]?.length > 31.5 && placed.perimeter.closed[0]?.length < 32.5, `Derived perimeter length is not physically ~32 units (${placed.perimeter.closed[0]?.length}).`);
    assert(placed.state.settlement.derivedBlueprintPerimeters === 1, 'Settlement state did not expose the derived blueprint enclosure.');

    let built = null;
    for (let chunk = 0; chunk < 50; chunk++) {
      await page.evaluate(() => window.realitySandboxDebug.advance(60));
      built = await page.evaluate(() => ({
        state:window.realitySandboxRunevaleSettlementV68.getState(),
        completed:window.realitySandboxRunevaleCastlePerimetersV69.getPerimeters({ completedOnly:true }),
        all:window.realitySandboxRunevaleCastlePerimetersV69.getPerimeters({ completedOnly:false }),
        v68:window.realitySandboxRunevaleSettlementV68.getStats(),
        v69:window.realitySandboxRunevaleCastlePerimetersV69.getStats(),
      }));
      if (built.completed.closedCount === 1) break;
    }

    assert(built.completed.closedCount === 1, `Workers did not physically complete the closed perimeter (${built.completed.closedCount}).`);
    assert(built.completed.closed[0].segments === 4, 'Completed enclosure lost one or more fortification segments.');
    assert(built.state.structures.filter(item => item.type === 'palisade' && item.status === 'complete').length === 4, 'Not all four palisades completed through v68 construction.');
    assert(built.state.structures.every(item => item.delivered.wood >= item.required.wood), 'A completed perimeter segment lacks its physically delivered wood.');
    assert(built.v68.materialHauls >= 8 && built.v68.constructionWorkTicks > 0, 'Closed perimeter did not use physical worker hauling/construction.');
    assert(built.state.settlement.enclosedByCompletedFortifications === true, 'Completed closed loop is not reflected as a derived settlement enclosure.');
    assert(built.state.settlement.derivedPerimeters === 1, 'Completed settlement perimeter count is incorrect.');
    assert(built.state.settlement.defense >= 12, `Four completed palisades did not derive expected defense (${built.state.settlement.defense}).`);
    assert(built.v69.fullFootprintTerrainValidation && built.v69.endpointSnapping && built.v69.closedPerimetersDerivedFromWallGraph, 'v69 core castle-quality contracts are inactive.');
    assert(built.v69.snappedPlacements >= 3 && built.v69.cornerSnaps >= 3, 'v69 did not record the three physical corner snaps.');
    assert(built.v69.noHardWallSegmentCap && built.v69.noHardBuildingCap && built.v69.noHardPopulationCap && built.v69.noHardDisplayCap, 'v69 introduced an arbitrary cap.');

    for (const structure of built.state.structures) {
      for (const forbidden of ['castleId','perimeterId','fortressId','wallGroupId']) {
        assert(!(forbidden in structure), `Structure ${structure.id} stores forbidden scripted enclosure identifier ${forbidden}.`);
      }
    }
    assert(!('castleId' in built.state.settlement) && !('perimeterId' in built.state.settlement), 'Settlement stores a scripted castle/perimeter identity instead of deriving the graph.');
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'runevale-castle-perimeters-v69.json'), JSON.stringify({ shoreline, site, harvest, founded, placed, built, pageErrors }, null, 2));
    await page.screenshot({ path:path.join(artifactDir, 'runevale-castle-perimeters-v69.png'), fullPage:true });
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
