const SURFACE_GLOBE_BUILD = 'surface-globe-v73b-continuous';
const GROUND_GLOBE_ZOOM = 1.16;
const HIGH_ALTITUDE_GLOBE_ZOOM = 0.78;
const ALTITUDE_ZOOM_REFERENCE = 5000;
const ENTER_TRANSITION_MS = 900;
const EXIT_TRANSITION_MS = 700;
const FOLLOW_HALF_LIFE_MS = 90;
const CAMERA_EPSILON = 1e-5;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const wrap01 = value => ((value % 1) + 1) % 1;
const smoothstep = value => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

function wrappedDelta01(from, to) {
  let delta = to - from;
  if (delta > 0.5) delta -= 1;
  else if (delta < -0.5) delta += 1;
  return delta;
}

function blendCamera(from, to, amount) {
  const t = clamp(amount, 0, 1);
  return {
    centerX: wrap01(from.centerX + wrappedDelta01(from.centerX, to.centerX) * t),
    centerY: from.centerY + (to.centerY - from.centerY) * t,
    zoom: from.zoom + (to.zoom - from.zoom) * t,
  };
}

function installPresentationStyle() {
  if (document.getElementById('surfaceGlobePresentationStyleV73')) return;
  const style = document.createElement('style');
  style.id = 'surfaceGlobePresentationStyleV73';
  style.textContent = `
    html[data-surface-presentation^="globe"][data-surface-mode="active"] #surfaceModeLayer {
      background: transparent !important;
    }

    html[data-surface-presentation^="globe"][data-surface-mode="active"] #lofiLivingCanvas {
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
    }

    html[data-surface-presentation^="globe"][data-surface-mode="active"] #surfaceModeLayer canvas:not(#surfaceModeCanvas):not(#surfacePlantModelCanvas) {
      display: none !important;
      visibility: hidden !important;
    }

    html[data-surface-presentation^="globe"][data-surface-mode="active"] #surfacePlantModelCanvas {
      visibility: visible !important;
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
  let transition = null;
  let lastFrameAt = performance.now();

  function updateHudLabel() {
    const label = document.querySelector('#surfaceModeHud b');
    if (label && label.textContent !== 'SURFACE MODE · NYSA · GLOBE') {
      label.textContent = 'SURFACE MODE · NYSA · GLOBE';
    }
  }

  function targetCameraForPlayer() {
    const player = mode.getPlayer();
    const current = runtime.getCamera();
    return {
      centerX: wrap01(player.x / Math.max(1, world.width)),
      centerY: clamp(player.y / Math.max(1, world.height), 0.01, 0.99),
      zoom: altitudeToGlobeZoom(player.altitude, current),
    };
  }

  function setCameraIfChanged(next) {
    const current = runtime.getCamera();
    if (
      Math.abs(wrappedDelta01(current.centerX, next.centerX)) > CAMERA_EPSILON ||
      Math.abs(current.centerY - next.centerY) > CAMERA_EPSILON ||
      Math.abs(current.zoom - next.zoom) > CAMERA_EPSILON
    ) {
      runtime.setCamera(next);
      cameraSyncs++;
    }
    lastZoom = next.zoom;
  }

  function startTransition(kind, from, to, duration, now = performance.now()) {
    transition = { kind, from: { ...from }, to: { ...to }, startedAt: now, duration };
    document.documentElement.dataset.surfaceCameraTransition = kind;
  }

  function runTransition(now) {
    if (!transition) return false;
    const progress = smoothstep((now - transition.startedAt) / Math.max(1, transition.duration));
    setCameraIfChanged(blendCamera(transition.from, transition.to, progress));
    if (progress >= 1) {
      const finishedKind = transition.kind;
      transition = null;
      document.documentElement.dataset.surfaceCameraTransition = 'none';
      if (finishedKind === 'exit') {
        previousCamera = null;
        document.documentElement.dataset.surfacePresentation = 'globe-ready';
        document.documentElement.dataset.surfaceModeRenderer = 'gpu-controller-spherical-topology';
      }
    }
    return true;
  }

  function followPlayer(now) {
    const target = targetCameraForPlayer();
    const current = runtime.getCamera();
    const dt = Math.max(0, now - lastFrameAt);
    const amount = 1 - Math.pow(0.5, dt / FOLLOW_HALF_LIFE_MS);
    setCameraIfChanged(blendCamera(current, target, amount));
  }

  function enterGlobePresentation(now) {
    const current = runtime.getCamera();
    previousCamera = { ...current };
    document.documentElement.dataset.surfacePresentation = 'globe-entering';
    document.documentElement.dataset.surfacePresentationBuild = SURFACE_GLOBE_BUILD;
    document.documentElement.dataset.surfaceModeRenderer = 'pixi-globe-surface';
    document.body.dataset.worldGeometry = 'sphere';
    layer.style.background = 'transparent';
    sourceCanvas.style.visibility = 'visible';
    sourceCanvas.style.opacity = '1';
    updateHudLabel();
    startTransition('enter', current, targetCameraForPlayer(), ENTER_TRANSITION_MS, now);
  }

  function beginExitGlobePresentation(now) {
    const current = runtime.getCamera();
    const destination = previousCamera || current;
    document.documentElement.dataset.surfacePresentation = 'globe-exiting';
    startTransition('exit', current, destination, EXIT_TRANSITION_MS, now);
  }

  function loop(now) {
    requestAnimationFrame(loop);
    const active = Boolean(mode.isActive?.() && document.documentElement.dataset.surfaceMode === 'active');

    if (active && !wasActive) enterGlobePresentation(now);
    if (!active && wasActive) beginExitGlobePresentation(now);

    if (active) {
      activeFrames++;
      updateHudLabel();
      if (transition?.kind === 'enter') {
        transition.to = targetCameraForPlayer();
        if (!runTransition(now)) followPlayer(now);
      } else {
        document.documentElement.dataset.surfacePresentation = 'globe';
        followPlayer(now);
      }
    } else if (transition?.kind === 'exit') {
      runTransition(now);
    }

    wasActive = active;
    lastFrameAt = now;
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
      continuousCameraTransition: true,
      transition: transition?.kind || 'none',
      enterTransitionMs: ENTER_TRANSITION_MS,
      exitTransitionMs: EXIT_TRANSITION_MS,
      activeFrames,
      cameraSyncs,
      globeZoom: lastZoom,
    }),
  };

  window.realitySandboxSurfaceGlobeV73 = api;
  document.documentElement.dataset.surfacePresentation = 'globe-ready';
  document.documentElement.dataset.surfacePresentationBuild = SURFACE_GLOBE_BUILD;
  document.documentElement.dataset.surfaceCameraTransition = 'none';

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
