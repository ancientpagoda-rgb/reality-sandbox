# Agent/browser interaction bridge

The public root exposes `window.realitySandboxAgentInteraction` after the living-planet canvas is ready.

The bridge is intentionally read/geometry oriented. Browser agents should use real browser input (Playwright/WebDriver/CDP) against `#lofiLivingCanvas`, so automation follows the same pointer and wheel handlers as a human user.

## Browser-agent primitives

- `getState()` — camera, canvas bounds, selected region, dragging state and capabilities.
- `getCanvasRect()` — current CSS-pixel canvas bounds.
- `normalizedToClient(x, y)` — convert 0..1 canvas coordinates to client coordinates.
- `clientToNormalized(x, y)` — inverse conversion.
- `clientToWorld(x, y)` — project a visible client point to normalized world coordinates.
- `worldToClient(x, y)` — project normalized world coordinates to client coordinates and report whether the point is on the visible hemisphere.
- `getCamera()` — current camera center and zoom.
- `inspectSelected()` — current selected-region state.
- `getSurfaceState()` — whether surface mode is available/active.

## Real mouse example (Playwright)

```js
const state = await page.evaluate(() => window.realitySandboxAgentInteraction.getState());
const { centerX, centerY } = state.canvas;

await page.mouse.move(centerX, centerY);
await page.mouse.down();
await page.mouse.move(centerX + 140, centerY - 60, { steps: 12 });
await page.mouse.up();

await page.mouse.move(centerX, centerY);
await page.mouse.wheel(0, -300);

const point = await page.evaluate(() =>
  window.realitySandboxAgentInteraction.normalizedToClient(0.57, 0.46)
);
await page.mouse.click(point.x, point.y);
```

The repository smoke test `scripts/agent-interaction-smoke.cjs` verifies grab/hold state, drag camera movement, wheel zoom, arbitrary-point selection, and world/client projection with real Playwright mouse input.
