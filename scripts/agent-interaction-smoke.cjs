const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_AGENT_INTERACTION_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'agent-interaction-smoke');
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
      window.realitySandboxUnified?.getCamera &&
      window.realitySandboxAgentInteraction?.installed
    ), null, { timeout:120000 });

    const before = await page.evaluate(() => window.realitySandboxAgentInteraction.getState());
    assert(before.capabilities.realMouseGrab && before.capabilities.realMouseDrag && before.capabilities.realMouseWheelZoom && before.capabilities.realMouseClick, 'Agent interaction capabilities are incomplete.');
    assert(before.canvas.width > 100 && before.canvas.height > 100, 'Interactive canvas has no usable geometry.');

    // Real mouse grab + drag. Keep the button held and confirm the page reports a grab.
    const start = { x:before.canvas.centerX, y:before.canvas.centerY };
    const end = { x:start.x + Math.min(150, before.canvas.width * 0.16), y:start.y - Math.min(80, before.canvas.height * 0.10) };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down({ button:'left' });
    const held = await page.evaluate(() => window.realitySandboxAgentInteraction.getState());
    assert(held.dragging === true, 'Canvas did not enter dragging state while the real mouse button was held.');
    await page.mouse.move(end.x, end.y, { steps:12 });
    await page.mouse.up({ button:'left' });

    const afterDrag = await page.evaluate(() => window.realitySandboxAgentInteraction.getState());
    const cameraDelta = Math.hypot(afterDrag.camera.centerX - before.camera.centerX, afterDrag.camera.centerY - before.camera.centerY);
    assert(cameraDelta > 0.001, `Real mouse drag did not move the camera (${cameraDelta}).`);
    assert(afterDrag.dragging === false, 'Canvas stayed in dragging state after mouse release.');

    // Real wheel zoom over the globe.
    const zoomPoint = { x:afterDrag.canvas.centerX, y:afterDrag.canvas.centerY };
    await page.mouse.move(zoomPoint.x, zoomPoint.y);
    await page.mouse.wheel(0, -320);
    await page.waitForTimeout(50);
    const afterZoom = await page.evaluate(() => window.realitySandboxAgentInteraction.getState());
    assert(afterZoom.camera.zoom > afterDrag.camera.zoom + 0.01, `Real mouse wheel did not zoom in (${afterDrag.camera.zoom} -> ${afterZoom.camera.zoom}).`);

    // Arbitrary visible point: resolve it through the bridge, click it with the real mouse,
    // and verify the selected procedural latitude/longitude matches the projected point.
    const target = await page.evaluate(() => {
      const bridge = window.realitySandboxAgentInteraction;
      const point = bridge.normalizedToClient(0.57, 0.46);
      return { point, world:bridge.clientToWorld(point.x, point.y) };
    });
    assert(target.world && target.world.normal.z > 0, 'Chosen arbitrary click point is not on the visible globe.');
    await page.mouse.click(target.point.x, target.point.y, { button:'left' });
    await page.waitForTimeout(50);

    const afterClick = await page.evaluate(() => ({
      state:window.realitySandboxAgentInteraction.getState(),
      projectedCenter:window.realitySandboxAgentInteraction.worldToClient(
        window.realitySandboxAgentInteraction.getCamera().centerX,
        window.realitySandboxAgentInteraction.getCamera().centerY
      ),
    }));
    const expectedLatitude = 90 - target.world.y * 180;
    const expectedLongitude = target.world.x * 360 - 180;
    assert(Math.abs(afterClick.state.selectedRegion.latitude - expectedLatitude) < 0.75, `Arbitrary mouse click selected wrong latitude (${afterClick.state.selectedRegion.latitude} vs ${expectedLatitude}).`);
    assert(longitudeError(afterClick.state.selectedRegion.longitude, expectedLongitude) < 0.75, `Arbitrary mouse click selected wrong longitude (${afterClick.state.selectedRegion.longitude} vs ${expectedLongitude}).`);
    assert(afterClick.projectedCenter.visible === true, 'World-to-client projection says the camera center is hidden.');
    assert(Math.hypot(afterClick.projectedCenter.x - afterClick.state.canvas.centerX, afterClick.projectedCenter.y - afterClick.state.canvas.centerY) < 3, 'World-to-client projection does not map camera center back to canvas center.');
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    const result = { before, held, afterDrag, afterZoom, target, afterClick, pageErrors };
    fs.writeFileSync(path.join(artifactDir, 'agent-interaction.json'), JSON.stringify(result, null, 2));
    await page.screenshot({ path:path.join(artifactDir, 'agent-interaction.png'), fullPage:true });
    console.log('Agent interaction smoke passed:', JSON.stringify({ cameraDelta, zoom:afterZoom.camera.zoom, selected:afterClick.state.selectedRegion }));
  } finally {
    await browser.close();
  }

  function longitudeError(a, b) {
    let d = Math.abs(a - b) % 360;
    if (d > 180) d = 360 - d;
    return d;
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }
})().catch(error => {
  fs.writeFileSync(path.join(artifactDir, 'fatal-error.txt'), `${error.stack || error.message}\n`);
  console.error(error);
  process.exitCode = 1;
});
