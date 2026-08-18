const SURFACE_GLOBE_BUILD = 'surface-globe-v73a';
const GROUND_GLOBE_ZOOM = 1.10;
const HIGH_ALTITUDE_GLOBE_ZOOM = 0.78;
const ALTITUDE_ZOOM_REFERENCE = 5000;
const CAMERA_EPSILON = 1e-5;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const wrap01 = value => ((value % 1) + 1) % 1;

function installPresentationStyle() {
  if (document.getElementById('surfaceGlobePresentationStyleV73')) return;
  const style = document.createElement('style');
  style.id = 'surfaceGlobePresentationStyleV73';
  style.textContent = `
    html[data-surface-presentation="globe"][data-surface-mode="active"] #surfaceModeLayer {
      background: transparent !important;
    }

    html[data-surface-presentation="globe"][data-surface-mode="active"] #lofiLivingCanvas {
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
    }

    html[data-surface-presentation="globe"][data-surface-mode="active"] #surfaceModeLayer canvas:not(#surfaceModeCanvas) {
      display: none !important;
      visibility: hidden !important;
    }
  `;
  document.head.append(style);
}

async function waitForRuntime() {
  for (let attempt = 0; attempt < 300; attempt++) {
    const ready = window.realitySandboxReady;
    if (ready && typeof ready.then === 'function') {
      try { await ready; } catch { return null; }
    }

    const runtime = window.realitySandboxUnified;
    const planet = window.realitySandboxPlanet;
    const mode = window.realitySandboxSurfaceMode;
    const sourceCanvas = document.getElementById('lofiLivingCanvas');
    const layer = document.getElementById('surfaceModeLayer');
    if (
      runtime?.getCamera && runtime?.setCamera &&
      planet?.world && mode?.getPlayer && mode?.isActive &&
      sourceCanvas && layer
    ) return { runtime, planet, mode, sourceCanvas, layer };

    await new Promise(resolve => setTimeout(resolve, 40));
  }
  return null;
}

function altitudeToGlobeZoom(altitude, camera) {
  const height = Math.max(0, Number(altitude) || 0);
  const normalized = clamp(Math.log1p(height) / Math.log1p(ALTITUDE_ZOOM_REFERENCE), 0, 1);
  const desired = GROUND_GLOBE_ZOOM + (HIGH_ALTITUDE_GLOBE_ZOOM - GROUND_GLOBE_ZOOM) * normalized;
  return clamp(desired, camera.minZoom ?? 0.7, camera.maxZoom ?? 12);
}

function install({ runtime, planet, mode, sourceCanvas, layer }) {
  if (window.realitySandboxSurfaceGlobeV73?.installed) return;

  installPresentationStyle();

  const { world } = planet;
  let previousCamera = null;
  let wasActive = false;
  let activeFrames = 0;
  let cameraSyncs = 0;
  let lastZoom = 1;

  function updateHudLabel() {
    const label = document.querySelector('#surfaceModeHud b');
    if (label && label.textContent !== 'SURFACE MODE · NYSA · GLOBE') {
      label.textContent = 'SURFACE MODE · NYSA · GLOBE';
    }
  }

  function syncGlobeCamera() {
    const player = mode.getPlayer();
    const current = runtime.getCamera();
    const centerX = wrap01(player.x / Math.max(1, world.width));
    const centerY = clamp(player.y / Math.max(1, world.height), 0.01, 0.99);
    const zoom = altitudeToGlobeZoom(player.altitude, current);
    lastZoom = zoom;

    if (
      Math.abs(current.centerX - centerX) > CAMERA_EPSILON ||
      Math.abs(current.centerY - centerY) > CAMERA_EPSILON ||
      Math.abs(current.zoom - zoom) > CAMERA_EPSILON
    ) {
      runtime.setCamera({ centerX, centerY, zoom });
      cameraSyncs++;
    }
  }

  function enterGlobePresentation() {
    previousCamera = runtime.getCamera();
    document.documentElement.dataset.surfacePresentation = 'globe';
    document.documentElement.dataset.surfacePresentationBuild = SURFACE_GLOBE_BUILD;
    document.documentElement.dataset.surfaceModeRenderer = 'pixi-globe-surface';
    document.body.dataset.worldGeometry = 'sphere';
    layer.style.background = 'transparent';
    sourceCanvas.style.visibility = 'visible';
    sourceCanvas.style.opacity = '1';
    syncGlobeCamera();
    updateHudLabel();
  }

  function leaveGlobePresentation() {
    if (previousCamera) runtime.setCamera(previousCamera);
    previousCamera = null;
    document.documentElement.dataset.surfacePresentation = 'globe-ready';
    document.documentElement.dataset.surfaceModeRenderer = 'gpu-controller-spherical-topology';
  }

  function loop() {
    requestAnimationFrame(loop);
    const active = Boolean(mode.isActive?.() && document.documentElement.dataset.surfaceMode === 'active');

    if (active && !wasActive) enterGlobePresentation();
    if (!active && wasActive) leaveGlobePresentation();

    wasActive = active;
    if (!active) return;

    activeFrames++;
    syncGlobeCamera();
    updateHudLabel();
  }
  requestAnimationFrame(loop);

  const api = {
    installed: true,
    build: SURFACE_GLOBE_BUILD,
    isActive: () => wasActive,
    getStats: () => ({
      build: SURFACE_GLOBE_BUILD,
      active: wasActive,
      geometry: 'globe',
      canonicalRenderer: 'lofiLivingCanvas',
      localTangentRendererVisible: false,
      playerCoordinatesDriveGlobeCamera: true,
      altitudeControlsGlobeScale: true,
      activeFrames,
      cameraSyncs,
      globeZoom: lastZoom,
    }),
  };

  window.realitySandboxSurfaceGlobeV73 = api;
  document.documentElement.dataset.surfacePresentation = 'globe-ready';
  document.documentElement.dataset.surfacePresentationBuild = SURFACE_GLOBE_BUILD;

  const previousDiagnostics = window.realitySandboxPresentationDiagnostics;
  window.realitySandboxPresentationDiagnostics = () => ({
    ...(typeof previousDiagnostics === 'function' ? previousDiagnostics() : {}),
    surfaceGlobeV73: api.getStats(),
  });
}

async function boot() {
  const state = await waitForRuntime();
  if (!state) {
    document.documentElement.dataset.surfacePresentation = 'globe-unavailable';
    return;
  }
  install(state);
}

boot();
