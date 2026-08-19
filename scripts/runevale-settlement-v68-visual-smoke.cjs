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
    await page.waitForFunction(() => typeof window.realitySandboxLoadLegacySurfaceDetail === 'function', null, { timeout:120000 });
    const legacyLoaded = await page.evaluate(() => window.realitySandboxLoadLegacySurfaceDetail());
    assert(legacyLoaded, `Lazy Surface detail failed to load (${await page.evaluate(() => document.documentElement.dataset.surfaceLegacyDetailError || 'unknown')}).`);
    await page.waitForFunction(() => Boolean(
      window.realitySandboxDebug?.ready &&
      window.realitySandboxSurfaceMode?.enterAt &&
      window.realitySandboxSurfaceSphereV37?.installed &&
      window.realitySandboxRunevaleSettlementV68?.installed &&
      window.realitySandboxRunevaleSettlementSphereGpuV68a?.installed
    ), null, { timeout:120000 });

    await page.evaluate(() => window.realitySandboxRunevaleSettlementV68.resetForTest());

    const patches = await page.evaluate(() => {
      const planet = window.realitySandboxPlanet;
      const c = planet.world.ecs.components;
      return [...c.resource.entries()]
        .map(([id, item]) => ({ id, amount:Number(item.amount) || 0, p:c.position.get(id) }))
        .filter(entry => entry.p && entry.amount > 0.16 && planet.living.sampleDynamicPlanet(entry.p.x, entry.p.y, 'v68-visual-find')?.land)
        .slice(0, 12)
        .map(entry => ({ id:entry.id, amount:entry.amount, x:entry.p.x, y:entry.p.y }));
    });
    assert(patches.length >= 2, `Need at least two real vegetation patches for visual proof; found ${patches.length}.`);

    const gathered = [];
    for (const patch of patches) {
      await page.evaluate(p => window.realitySandboxSurfaceMode.enterAt(p.x, p.y), patch);
      await page.waitForFunction(() => document.documentElement.dataset.surfaceMode === 'active', null, { timeout:30000 });
      const result = await page.evaluate(() => ({
        harvest:window.realitySandboxRunevaleSettlementV68.gatherWood(),
        state:window.realitySandboxRunevaleSettlementV68.getState(),
      }));
      gathered.push({ patch, result });
      if (result.state.playerPack.wood >= 8) break;
    }
    const last = gathered[gathered.length - 1];
    assert(last?.result.harvest.ok, 'Physical wood harvesting failed during visual proof.');
    assert(last.result.state.playerPack.wood >= 8, `Physical harvest did not produce enough wood for one palisade (${last.result.state.playerPack.wood}).`);

    const founded = await page.evaluate(() => {
      const api = window.realitySandboxRunevaleSettlementV68;
      const settlement = api.foundSettlement('Visualmarch');
      const blueprint = api.placeBlueprint('palisade', 10);
      return { settlement, blueprint, state:api.getState() };
    });
    assert(founded.settlement.ok, `Visual settlement founding failed: ${founded.settlement.reason || 'unknown'}.`);
    assert(founded.blueprint.ok, `Visual palisade placement failed: ${founded.blueprint.reason || 'unknown'}.`);

    // v37 intentionally pauses authoritative module stepping while its legacy
    // Surface presentation is active. Construction belongs to the simulation
    // clock, so leave Surface while workers physically haul/build, then re-enter
    // at the known settlement location for the actual spherical visibility proof.
    await page.evaluate(() => window.realitySandboxSurfaceMode.exit());
    await page.waitForFunction(() => document.documentElement.dataset.surfaceMode === 'inactive', null, { timeout:10000 });

    let built = null;
    for (let chunk = 0; chunk < 24; chunk++) {
      await page.evaluate(() => window.realitySandboxDebug.advance(60));
      built = await page.evaluate(() => window.realitySandboxRunevaleSettlementV68.getState());
      if (built.structures.some(item => item.type === 'palisade' && item.status === 'complete')) break;
    }
    const palisade = built.structures.find(item => item.type === 'palisade');
    assert(palisade?.status === 'complete', `Physical workers did not finish the visual palisade (${palisade?.status || 'missing'}).`);

    // Face the completed structure from a known local position. enterAt resets yaw
    // to zero, and the palisade was placed +X from this founding point.
    await page.evaluate(({ x, y }) => window.realitySandboxSurfaceMode.enterAt(x, y), founded.state.settlement);
    await page.waitForFunction(() => window.realitySandboxSurfaceSphereV37.getStats().nearBuildsCompleted > 0, null, { timeout:90000 });

    await page.waitForFunction(() => {
      const visual = window.realitySandboxRunevaleSettlementSphereGpuV68a?.getStats?.();
      return Boolean(
        visual?.activeFrames > 2 &&
        visual.visibleStructures >= 1 &&
        visual.centrallyVisibleStructures >= 1 &&
        visual.rendererTriangles > 0
      );
    }, null, { timeout:30000 });

    await page.waitForTimeout(600);
    const visual = await page.evaluate(() => {
      const api = window.realitySandboxRunevaleSettlementSphereGpuV68a;
      const settlement = window.realitySandboxRunevaleSettlementV68;
      const base = document.getElementById('surfaceGpuCanvas');
      const castle = document.getElementById('runevaleSettlementSphereGpuCanvasV68a');
      const legacy = document.getElementById('runevaleSettlementCanvasV68');
      const hud = document.getElementById('surfaceModeHud');
      const buildHud = document.getElementById('runevaleSettlementHudV68');
      const layer = document.getElementById('surfaceModeLayer');
      const css = el => el ? getComputedStyle(el) : null;
      const baseCss = css(base);
      const castleCss = css(castle);
      const legacyCss = css(legacy);
      const hudCss = css(hud);
      const buildHudCss = css(buildHud);
      const layerRect = layer?.getBoundingClientRect();
      const castleRect = castle?.getBoundingClientRect();
      return {
        stats:api.getStats(),
        settlementStats:settlement.getStats(),
        sphere:window.realitySandboxSurfaceSphereV37.getStats(),
        base:{ display:baseCss?.display, zIndex:Number(baseCss?.zIndex || 0), opacity:Number(baseCss?.opacity || 1) },
        castle:{ display:castleCss?.display, zIndex:Number(castleCss?.zIndex || 0), opacity:Number(castleCss?.opacity || 1), width:castleRect?.width || 0, height:castleRect?.height || 0 },
        legacy:{ display:legacyCss?.display },
        hud:{ zIndex:Number(hudCss?.zIndex || 0) },
        buildHud:{ zIndex:Number(buildHudCss?.zIndex || 0) },
        layer:{ width:layerRect?.width || 0, height:layerRect?.height || 0 },
        dataset:document.documentElement.dataset.runevaleSettlementSphereGpuV68a,
      };
    });

    assert(visual.dataset === 'ready-spherical-threejs', `Spherical castle GPU dataset is ${visual.dataset || 'missing'}.`);
    assert(visual.stats.strategy === 'transparent-threejs-spherical-settlement-layer', 'Wrong v68 visual strategy.');
    assert(visual.stats.matchesSurfaceSphereFovDegrees === 100, `Castle camera FOV diverged from sphere renderer (${visual.stats.matchesSurfaceSphereFovDegrees}).`);
    assert(visual.stats.sharesSurfacePlayerCameraState && visual.stats.sharesSurfaceChunkAnchor && visual.stats.sharesSurfaceCurvatureRadius, 'Castle renderer is not locked to the Nysa sphere camera/frame.');
    assert(visual.stats.visibleStructures >= 1 && visual.stats.centrallyVisibleStructures >= 1, `Palisade is not visibly in-frame (${JSON.stringify(visual.stats)}).`);
    assert(visual.stats.rendererCalls > 0 && visual.stats.rendererTriangles > 0, 'Castle WebGL layer produced no actual draw calls/triangles.');
    assert(visual.stats.physicalActionsBypassSphereHudCache && visual.stats.exactActionTerrainReads > 0, 'v68 physical actions did not bypass the sphere HUD terrain cache.');
    assert(visual.stats.legacy2dOverlayHidden, 'Legacy misaligned 2D castle overlay is still visible.');
    assert(visual.base.display === 'block' && visual.castle.display === 'block', 'Terrain and castle GPU canvases are not simultaneously presenting.');
    assert(visual.base.zIndex < visual.castle.zIndex && visual.castle.zIndex < visual.hud.zIndex && visual.hud.zIndex < visual.buildHud.zIndex, `GPU/HUD stacking is invalid: ${JSON.stringify({ base:visual.base.zIndex, castle:visual.castle.zIndex, hud:visual.hud.zIndex, buildHud:visual.buildHud.zIndex })}`);
    assert(visual.castle.opacity === 1, `Castle GPU layer is not opaque as a compositing canvas (${visual.castle.opacity}).`);
    assert(Math.abs(visual.castle.width - visual.layer.width) < 1 && Math.abs(visual.castle.height - visual.layer.height) < 1, 'Castle GPU canvas does not cover the same surface viewport as Nysa terrain.');
    assert(visual.legacy.display === 'none', 'Old 2D castle canvas was not retired from presentation.');
    assert(visual.sphere.nearBuildsCompleted > 0, 'Screenshot would be taken before real near terrain completed.');
    assert(visual.settlementStats.sphereGpuStructureRenderer && visual.settlementStats.visibleGpuStructures >= 1, 'v68 aggregate gameplay stats do not report the visible sphere renderer.');
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    const screenshot = path.join(artifactDir, 'runevale-settlement-v68-spherical-visible.png');
    await page.screenshot({ path:screenshot, fullPage:true });
    fs.writeFileSync(path.join(artifactDir, 'runevale-settlement-v68-visual.json'), JSON.stringify({ gathered, founded, built, visual, pageErrors }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  fs.writeFileSync(path.join(artifactDir, 'visual-fatal-error.txt'), `${error.stack || error.message}\n`);
  console.error(error);
  process.exitCode = 1;
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
