// Browser-agent interaction bridge for the live Nysa globe.
// This module does not replace user controls. It exposes geometry/state so
// external browser automation can drive the same canvas with real mouse input.

const CANVAS_ID = 'lofiLivingCanvas';
const READY_EVENT = 'reality-sandbox-agent-interaction-ready';

function waitForRuntime() {
  return new Promise(resolve => {
    const poll = () => {
      const runtime = window.realitySandboxUnified;
      const canvas = document.getElementById(CANVAS_ID);
      if (
        runtime?.getCamera &&
        runtime?.selectAtClientPoint &&
        runtime?.clientToWorld &&
        runtime?.worldToClientPoint &&
        canvas instanceof HTMLCanvasElement
      ) {
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

  function normalizedToClient(x, y) {
    const r = rect();
    return {
      x:r.left + Math.max(0, Math.min(1, Number(x) || 0)) * r.width,
      y:r.top + Math.max(0, Math.min(1, Number(y) || 0)) * r.height,
    };
  }

  function clientToNormalized(clientX, clientY) {
    const r = rect();
    return {
      x:r.width ? (clientX - r.left) / r.width : 0.5,
      y:r.height ? (clientY - r.top) / r.height : 0.5,
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
        realMouseDrag:true,
        realMouseWheelZoom:true,
        realMouseClick:true,
        arbitraryClientPoint:true,
        arbitraryNormalizedPoint:true,
        worldPointProjection:true,
        surfaceModeAutomation:true,
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
    clientToWorld:(clientX, clientY) => runtime.clientToWorld(clientX, clientY),
    worldToClient:(worldX, worldY) => runtime.worldToClientPoint(worldX, worldY),
    inspectSelected:() => runtime.inspectSelected?.() || null,
    selectAtClientPoint:(clientX, clientY) => runtime.selectAtClientPoint(clientX, clientY),
    selectAtNormalizedPoint(x, y) {
      const point = normalizedToClient(x, y);
      return runtime.selectAtClientPoint(point.x, point.y);
    },
    getSurfaceState() {
      return {
        active:Boolean(document.body.dataset.surfaceMode === 'active' || document.documentElement.dataset.surfaceMode === 'active'),
        bodyMode:document.body.dataset.surfaceMode || null,
        documentMode:document.documentElement.dataset.surfaceMode || null,
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
