// Browser-agent interaction bridge for the live Nysa globe.
// It intentionally does not replace the controls. External browser automation
// can use these coordinates/state helpers and then drive the canvas with real
// Playwright/WebDriver mouse input.

const CANVAS_ID = 'lofiLivingCanvas';
const READY_EVENT = 'reality-sandbox-agent-interaction-ready';
const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const wrap01 = value => ((value % 1) + 1) % 1;

function waitForRuntime() {
  return new Promise(resolve => {
    const poll = () => {
      const runtime = window.realitySandboxUnified;
      const canvas = document.getElementById(CANVAS_ID);
      if (runtime?.getCamera && runtime?.getSnapshot && canvas instanceof HTMLCanvasElement) {
        resolve({ runtime, canvas });
        return;
      }
      requestAnimationFrame(poll);
    };
    poll();
  });
}

function install({ runtime, canvas }) {
  if (window.realitySandboxAgentInteraction?.installed) return;

  function rect() {
    const r = canvas.getBoundingClientRect();
    return {
      left:r.left,
      top:r.top,
      right:r.right,
      bottom:r.bottom,
      width:r.width,
      height:r.height,
      centerX:r.left + r.width * 0.5,
      centerY:r.top + r.height * 0.5,
    };
  }

  function presentation() {
    const snapshot = runtime.getSnapshot?.() || {};
    const state = runtime.getState?.() || {};
    return {
      width:Number(snapshot.presentation?.logicalWidth) || 900,
      height:Number(snapshot.presentation?.logicalHeight) || 900,
      mobile:Boolean(state.mobile),
    };
  }

  function sphereFrame(width, height) {
    const info = presentation();
    const baseRadius = Math.min(width, height) * (info.mobile ? 0.42 : 0.43);
    return {
      cx:width * 0.5,
      cy:height * 0.5,
      radius:baseRadius * runtime.getCamera().zoom,
    };
  }

  function normalizedToClient(x, y) {
    const r = rect();
    return {
      x:r.left + clamp(Number(x) || 0, 0, 1) * r.width,
      y:r.top + clamp(Number(y) || 0, 0, 1) * r.height,
    };
  }

  function clientToNormalized(clientX, clientY) {
    const r = rect();
    return {
      x:r.width ? (clientX - r.left) / r.width : 0.5,
      y:r.height ? (clientY - r.top) / r.height : 0.5,
    };
  }

  function clientToWorld(clientX, clientY) {
    const r = rect();
    const info = presentation();
    if (!r.width || !r.height) return null;
    const px = (clientX - r.left) / r.width * info.width;
    const py = (clientY - r.top) / r.height * info.height;
    const { cx, cy, radius } = sphereFrame(info.width, info.height);
    const sx = (px - cx) / radius;
    const sy = -(py - cy) / radius;
    const rho2 = sx * sx + sy * sy;
    if (rho2 > 1) return null;
    const z = Math.sqrt(Math.max(0, 1 - rho2));
    const camera = runtime.getCamera();
    const lon0 = (camera.centerX - 0.5) * TAU;
    const lat0 = (0.5 - camera.centerY) * Math.PI;
    const sinLat0 = Math.sin(lat0);
    const cosLat0 = Math.cos(lat0);
    const latitude = Math.asin(clamp(sy * cosLat0 + z * sinLat0, -1, 1));
    const longitude = lon0 + Math.atan2(sx, z * cosLat0 - sy * sinLat0);
    return {
      x:wrap01(longitude / TAU + 0.5),
      y:clamp(0.5 - latitude / Math.PI, 0, 1),
      normal:{ x:sx, y:sy, z },
    };
  }

  function worldToClient(worldX, worldY) {
    const info = presentation();
    const camera = runtime.getCamera();
    const { cx, cy, radius } = sphereFrame(info.width, info.height);
    const lon = (wrap01(Number(worldX) || 0) - 0.5) * TAU;
    const lat = (0.5 - clamp(Number(worldY) || 0, 0, 1)) * Math.PI;
    const lon0 = (camera.centerX - 0.5) * TAU;
    const lat0 = (0.5 - camera.centerY) * Math.PI;
    const delta = lon - lon0;
    const sinLat = Math.sin(lat);
    const cosLat = Math.cos(lat);
    const sinLat0 = Math.sin(lat0);
    const cosLat0 = Math.cos(lat0);
    const x = cosLat * Math.sin(delta);
    const y = sinLat * cosLat0 - cosLat * Math.cos(delta) * sinLat0;
    const z = sinLat * sinLat0 + cosLat * Math.cos(delta) * cosLat0;
    const px = cx + x * radius;
    const py = cy - y * radius;
    const r = rect();
    return {
      x:r.left + px / info.width * r.width,
      y:r.top + py / info.height * r.height,
      depth:z,
      visible:z > 0,
      normalized:{ x:px / info.width, y:py / info.height },
    };
  }

  function getState() {
    return {
      installed:true,
      version:'agent-interaction-v1',
      canvasId:CANVAS_ID,
      canvas:rect(),
      camera:runtime.getCamera(),
      selectedRegion:runtime.inspectSelected?.() || null,
      dragging:canvas.dataset.dragging === 'true',
      capabilities:{
        realMouseGrab:true,
        realMouseDrag:true,
        realMouseWheelZoom:true,
        realMouseClick:true,
        arbitraryClientPoint:true,
        arbitraryNormalizedPoint:true,
        worldPointProjection:true,
      },
    };
  }

  const api = {
    installed:true,
    version:'agent-interaction-v1',
    getCanvas:() => canvas,
    getCanvasRect:rect,
    getCamera:() => runtime.getCamera(),
    getState,
    normalizedToClient,
    clientToNormalized,
    clientToWorld,
    worldToClient,
    inspectSelected:() => runtime.inspectSelected?.() || null,
    getSurfaceState() {
      const surface = window.realitySandboxSurfaceMode;
      return {
        active:Boolean(surface?.isActive?.()),
        available:Boolean(surface?.enterAt),
      };
    },
  };

  Object.defineProperty(window, 'realitySandboxAgentInteraction', {
    configurable:true,
    enumerable:true,
    writable:false,
    value:api,
  });
  document.documentElement.dataset.agentInteractionBridge = 'ready';
  window.dispatchEvent(new CustomEvent(READY_EVENT, { detail:{ version:api.version } }));
}

waitForRuntime().then(install);
