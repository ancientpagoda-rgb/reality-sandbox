const FOV = Math.PI * 0.72;
const POINTER_LOCK_YAW_SENSITIVITY = 0.00225;
const POINTER_LOCK_PITCH_SENSITIVITY = 0.0019;
const DRAG_YAW_SENSITIVITY = 0.004;
const DRAG_PITCH_SENSITIVITY = 0.0032;
const MAX_HORIZONTAL_REPROJECT_FRACTION = 0.055;
const MAX_VERTICAL_REPROJECT_FRACTION = 0.05;
const LOOK_ACTIVITY_WINDOW_MS = 150;
const LOOK_CREATURE_CACHE_MS = 190;
const IDLE_CREATURE_CACHE_MS = 90;
const CREATURE_CACHE_MOVE_TOLERANCE = 5;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

async function waitForSurfaceCanvas() {
  for (let attempt = 0; attempt < 300; attempt++) {
    const canvas = document.getElementById('surfaceModeCanvas');
    if (canvas && window.realitySandboxSurfaceMode) return canvas;
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  return null;
}

function installCameraPerformance(canvas) {
  if (window.realitySandboxSurfaceCameraPerformance?.installed) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let residualYaw = 0;
  let residualPitch = 0;
  let dragLook = false;
  let dragX = 0;
  let dragY = 0;
  let transformQueued = false;
  let lastLookInputAt = -Infinity;
  let lastRenderSyncAt = performance.now();
  let renderSyncs = 0;
  let transformFrames = 0;
  let maxResidualPixels = 0;
  let pointerSamples = 0;
  let creatureQueryCacheHits = 0;
  let creatureQueryCacheMisses = 0;
  let creaturePatchInstalled = false;
  let creatureCache = null;

  Object.assign(canvas.style, {
    willChange: 'transform',
    transformOrigin: '50% 50%',
    backfaceVisibility: 'hidden',
  });

  function surfaceActive() {
    return document.documentElement.dataset.surfaceMode === 'active';
  }

  function resetResidual() {
    residualYaw = 0;
    residualPitch = 0;
    lastRenderSyncAt = performance.now();
    renderSyncs++;
    scheduleTransform();
  }

  function scheduleTransform() {
    if (transformQueued) return;
    transformQueued = true;
    requestAnimationFrame(applyTransform);
  }

  function applyTransform() {
    transformQueued = false;
    if (!surfaceActive()) {
      if (canvas.style.transform) canvas.style.transform = '';
      return;
    }

    const cssWidth = Math.max(1, canvas.clientWidth || 1);
    const cssHeight = Math.max(1, canvas.clientHeight || 1);
    const horizontalFraction = clamp(-residualYaw / FOV, -MAX_HORIZONTAL_REPROJECT_FRACTION, MAX_HORIZONTAL_REPROJECT_FRACTION);
    const verticalFraction = clamp(residualPitch * 0.46, -MAX_VERTICAL_REPROJECT_FRACTION, MAX_VERTICAL_REPROJECT_FRACTION);
    const tx = horizontalFraction * cssWidth;
    const ty = verticalFraction * cssHeight;
    const edgeFraction = Math.max(Math.abs(horizontalFraction), Math.abs(verticalFraction));
    const scale = 1 + edgeFraction * 2.25;

    maxResidualPixels = Math.max(maxResidualPixels, Math.hypot(tx, ty));
    transformFrames++;

    if (Math.abs(tx) < 0.08 && Math.abs(ty) < 0.08) {
      canvas.style.transform = '';
    } else {
      canvas.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
    }
  }

  const nativeFillRect = ctx.fillRect.bind(ctx);
  ctx.fillRect = function surfaceCameraAwareFillRect(x, y, width, height) {
    if (surfaceActive() && x === 0 && y === 0 && width >= canvas.width && height >= canvas.height) {
      resetResidual();
    }
    return nativeFillRect(x, y, width, height);
  };

  function recordLook(yawDelta, pitchDelta) {
    if (!surfaceActive()) return;
    if (!Number.isFinite(yawDelta) || !Number.isFinite(pitchDelta)) return;
    residualYaw += yawDelta;
    residualPitch += pitchDelta;
    lastLookInputAt = performance.now();
    pointerSamples++;
    scheduleTransform();
  }

  document.addEventListener('mousemove', event => {
    if (!surfaceActive()) return;

    if (document.pointerLockElement === canvas) {
      recordLook(
        event.movementX * POINTER_LOCK_YAW_SENSITIVITY,
        event.movementY * POINTER_LOCK_PITCH_SENSITIVITY,
      );
      return;
    }

    if (!dragLook) return;
    const dx = event.clientX - dragX;
    const dy = event.clientY - dragY;
    dragX = event.clientX;
    dragY = event.clientY;
    recordLook(dx * DRAG_YAW_SENSITIVITY, dy * DRAG_PITCH_SENSITIVITY);
  }, { passive: true });

  canvas.addEventListener('pointerdown', event => {
    if (!surfaceActive() || event.pointerType !== 'mouse') return;
    dragLook = true;
    dragX = event.clientX;
    dragY = event.clientY;
  }, { passive: true });

  window.addEventListener('pointerup', () => { dragLook = false; }, { passive: true });
  window.addEventListener('pointercancel', () => { dragLook = false; }, { passive: true });
  window.addEventListener('blur', () => {
    dragLook = false;
    residualYaw = 0;
    residualPitch = 0;
    scheduleTransform();
  }, { passive: true });

  const modeObserver = new MutationObserver(() => {
    if (!surfaceActive()) {
      residualYaw = 0;
      residualPitch = 0;
      creatureCache = null;
      scheduleTransform();
    }
  });
  modeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-surface-mode'] });

  function wrappedDistanceSquared(x1, y1, x2, y2) {
    const planet = window.realitySandboxPlanet;
    const width = planet?.world?.width || 0;
    let dx = x1 - x2;
    if (width > 0) {
      if (dx > width * 0.5) dx -= width;
      else if (dx < -width * 0.5) dx += width;
    }
    const dy = y1 - y2;
    return dx * dx + dy * dy;
  }

  function installCreatureQueryPatch() {
    if (creaturePatchInstalled) return true;
    const performanceApi = window.realitySandboxSurfacePerformance;
    const originalQuery = performanceApi?.queryNearbyCreatures;
    if (typeof originalQuery !== 'function') return false;

    performanceApi.queryNearbyCreatures = function cameraAwareCreatureQuery(x, y, radius) {
      const now = performance.now();
      const looking = now - lastLookInputAt <= LOOK_ACTIVITY_WINDOW_MS;
      const maxAge = looking ? LOOK_CREATURE_CACHE_MS : IDLE_CREATURE_CACHE_MS;
      const toleranceSq = CREATURE_CACHE_MOVE_TOLERANCE * CREATURE_CACHE_MOVE_TOLERANCE;

      if (
        creatureCache &&
        creatureCache.radius === radius &&
        now - creatureCache.createdAt <= maxAge &&
        wrappedDistanceSquared(x, y, creatureCache.x, creatureCache.y) <= toleranceSq
      ) {
        creatureQueryCacheHits++;
        return creatureCache.results;
      }

      creatureQueryCacheMisses++;
      const results = originalQuery.call(performanceApi, x, y, radius);
      creatureCache = {
        x,
        y,
        radius,
        createdAt: now,
        results,
      };
      return results;
    };

    creaturePatchInstalled = true;
    return true;
  }

  function ensureCreatureQueryPatch() {
    if (installCreatureQueryPatch()) return;
    requestAnimationFrame(ensureCreatureQueryPatch);
  }
  requestAnimationFrame(ensureCreatureQueryPatch);

  const api = {
    installed: true,
    getStats: () => ({
      strategy: 'late-latched-camera-transform',
      heavyRenderTargetFps: 24,
      inputTransformTarget: 'display-refresh',
      lookActive: performance.now() - lastLookInputAt <= LOOK_ACTIVITY_WINDOW_MS,
      msSinceRenderSync: Number((performance.now() - lastRenderSyncAt).toFixed(2)),
      renderSyncs,
      transformFrames,
      pointerSamples,
      maxResidualPixels: Number(maxResidualPixels.toFixed(2)),
      creatureQueryCacheHits,
      creatureQueryCacheMisses,
      creaturePatchInstalled,
    }),
  };

  window.realitySandboxSurfaceCameraPerformance = api;
  document.documentElement.dataset.surfaceCameraPerformance = 'late-latched-transform';

  const previousDiagnostics = window.realitySandboxPresentationDiagnostics;
  window.realitySandboxPresentationDiagnostics = () => ({
    ...(typeof previousDiagnostics === 'function' ? previousDiagnostics() : {}),
    surfaceCameraPerformance: api.getStats(),
  });
}

async function boot() {
  const canvas = await waitForSurfaceCanvas();
  if (!canvas) {
    document.documentElement.dataset.surfaceCameraPerformance = 'unavailable';
    return;
  }
  installCameraPerformance(canvas);
}

boot();
