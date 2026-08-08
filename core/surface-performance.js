const FRAME_BUCKET_MS = 42;
const TERRAIN_NEAR_RADIUS = 52;
const TERRAIN_MID_RADIUS = 108;
const TERRAIN_FAR_RADIUS = 158;
const WATER_NEAR_RADIUS = 46;
const WATER_MID_RADIUS = 96;
const WATER_FAR_RADIUS = 142;
const TERRAIN_NEAR_RADIUS_SQ = TERRAIN_NEAR_RADIUS * TERRAIN_NEAR_RADIUS;
const TERRAIN_MID_RADIUS_SQ = TERRAIN_MID_RADIUS * TERRAIN_MID_RADIUS;
const TERRAIN_FAR_RADIUS_SQ = TERRAIN_FAR_RADIUS * TERRAIN_FAR_RADIUS;
const WATER_NEAR_RADIUS_SQ = WATER_NEAR_RADIUS * WATER_NEAR_RADIUS;
const WATER_MID_RADIUS_SQ = WATER_MID_RADIUS * WATER_MID_RADIUS;
const WATER_FAR_RADIUS_SQ = WATER_FAR_RADIUS * WATER_FAR_RADIUS;
const MAX_CACHE_ENTRIES = 18000;
const CACHE_SWEEP_INTERVAL_MS = 650;
const QUALITY_CHANGE_COOLDOWN_MS = 900;
const RENDER_SCALE_BY_LEVEL = [1, 0.96, 0.9, 0.82];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const wrap = (value, max) => ((value % max) + max) % max;

function shortestWrappedDelta(value, origin, size) {
  let delta = value - origin;
  if (delta > size * 0.5) delta -= size;
  else if (delta < -size * 0.5) delta += size;
  return delta;
}

function quantize(value, step) {
  if (!step) return value;
  return Math.round(value / step) * step;
}

function installSamplerCache(planet) {
  if (window.realitySandboxSurfacePerformance?.installed) return;

  const { world, living, waterCycle } = planet;
  if (!world || typeof living?.sampleDynamicPlanet !== 'function' || typeof waterCycle?.sample !== 'function') return;

  const originalTerrainSample = living.sampleDynamicPlanet.bind(living);
  const originalWaterSample = waterCycle.sample.bind(waterCycle);
  const terrainCache = new Map();
  const waterCache = new Map();

  let bucket = -1;
  let lastSweep = 0;
  let lastRaf = performance.now();
  let lastQualityChange = lastRaf;
  let smoothedFrameMs = 16.7;
  let qualityLevel = 0;
  let surfaceResolutionHookInstalled = false;
  let lastRenderScale = 1;

  const stats = {
    terrainHits: 0,
    terrainMisses: 0,
    waterHits: 0,
    waterMisses: 0,
    terrainQuantized: 0,
    waterQuantized: 0,
    cacheResets: 0,
    cacheSweeps: 0,
    expiredEntries: 0,
    qualityChanges: 0,
    peakQualityLevel: 0,
    renderScaleChanges: 0,
  };

  function activePlayer() {
    const mode = window.realitySandboxSurfaceMode;
    if (!mode?.isActive?.()) return null;
    return mode.getPlayer?.() || null;
  }

  function detailMultiplier() {
    return [1, 1.24, 1.58, 2.05][qualityLevel] || 1;
  }

  function renderScale() {
    if (!activePlayer()) return 1;
    return RENDER_SCALE_BY_LEVEL[qualityLevel] || 1;
  }

  function detailStep(distanceSquared, kind) {
    const multiplier = detailMultiplier();
    if (kind === 'water') {
      if (distanceSquared <= WATER_NEAR_RADIUS_SQ) return 0;
      if (distanceSquared <= WATER_MID_RADIUS_SQ) return 0.35 * multiplier;
      if (distanceSquared <= WATER_FAR_RADIUS_SQ) return 0.8 * multiplier;
      return 1.45 * multiplier;
    }

    if (distanceSquared <= TERRAIN_NEAR_RADIUS_SQ) return 0;
    if (distanceSquared <= TERRAIN_MID_RADIUS_SQ) return 0.25 * multiplier;
    if (distanceSquared <= TERRAIN_FAR_RADIUS_SQ) return 0.6 * multiplier;
    return 1.15 * multiplier;
  }

  function cacheTtl(distanceSquared, kind, step) {
    if (!step) return FRAME_BUCKET_MS + 4;
    const levelBonus = qualityLevel * 42;
    if (kind === 'water') {
      if (distanceSquared <= WATER_MID_RADIUS_SQ) return 92 + levelBonus;
      if (distanceSquared <= WATER_FAR_RADIUS_SQ) return 170 + levelBonus * 1.35;
      return 280 + levelBonus * 1.8;
    }
    if (distanceSquared <= TERRAIN_MID_RADIUS_SQ) return 76 + levelBonus;
    if (distanceSquared <= TERRAIN_FAR_RADIUS_SQ) return 142 + levelBonus * 1.25;
    return 230 + levelBonus * 1.65;
  }

  function beginBucket(now) {
    const nextBucket = Math.floor(now / FRAME_BUCKET_MS);
    if (nextBucket !== bucket) {
      bucket = nextBucket;
      stats.cacheResets++;
    }

    if (now - lastSweep < CACHE_SWEEP_INTERVAL_MS) return;
    lastSweep = now;
    stats.cacheSweeps++;
    for (const cache of [terrainCache, waterCache]) {
      for (const [key, entry] of cache) {
        if (entry.expiresAt < now) {
          cache.delete(key);
          stats.expiredEntries++;
        }
      }
      if (cache.size > MAX_CACHE_ENTRIES) cache.clear();
    }
  }

  function makeKey(sampleX, sampleY, step) {
    if (step) return `${step.toFixed(3)}:${Math.round(sampleX / step)}:${Math.round(sampleY / step)}`;
    return `exact:${sampleX.toFixed(4)}:${sampleY.toFixed(4)}`;
  }

  function sampleWithCache(kind, x, y, original) {
    const player = activePlayer();
    if (!player || !Number.isFinite(x) || !Number.isFinite(y)) return original(x, y);

    const now = performance.now();
    beginBucket(now);

    const wrappedX = wrap(x, world.width);
    const clampedY = clamp(y, 0, world.height);
    const dx = shortestWrappedDelta(wrappedX, player.x, world.width);
    const dy = clampedY - player.y;
    const distanceSquared = dx * dx + dy * dy;
    const step = detailStep(distanceSquared, kind);
    const sampleX = step ? wrap(quantize(wrappedX, step), world.width) : wrappedX;
    const sampleY = step ? clamp(quantize(clampedY, step), 0, world.height) : clampedY;
    const cache = kind === 'water' ? waterCache : terrainCache;
    const key = makeKey(sampleX, sampleY, step);
    const cached = cache.get(key);

    if (cached && cached.expiresAt >= now) {
      if (kind === 'water') stats.waterHits++;
      else stats.terrainHits++;
      return cached.value;
    }
    if (cached) cache.delete(key);

    if (kind === 'water') {
      stats.waterMisses++;
      if (step) stats.waterQuantized++;
    } else {
      stats.terrainMisses++;
      if (step) stats.terrainQuantized++;
    }

    const value = original(sampleX, sampleY);
    if (cache.size < MAX_CACHE_ENTRIES) {
      cache.set(key, { value, expiresAt: now + cacheTtl(distanceSquared, kind, step) });
    }
    return value;
  }

  living.sampleDynamicPlanet = function surfaceAwareTerrainSample(x, y, ...rest) {
    if (rest.length) return originalTerrainSample(x, y, ...rest);
    return sampleWithCache('terrain', x, y, originalTerrainSample);
  };

  waterCycle.sample = function surfaceAwareWaterSample(x, y, ...rest) {
    if (rest.length) return originalWaterSample(x, y, ...rest);
    return sampleWithCache('water', x, y, originalWaterSample);
  };

  function installAdaptiveSurfaceResolution() {
    if (surfaceResolutionHookInstalled) return true;
    const layer = document.getElementById('surfaceModeLayer');
    if (!layer) return false;

    const nativeGetBoundingClientRect = layer.getBoundingClientRect.bind(layer);
    layer.getBoundingClientRect = function adaptiveSurfaceBoundingRect() {
      const rect = nativeGetBoundingClientRect();
      const scale = renderScale();
      if (scale !== lastRenderScale) {
        lastRenderScale = scale;
        stats.renderScaleChanges++;
        document.documentElement.dataset.surfaceRenderScale = scale.toFixed(2);
      }
      if (scale >= 0.999) return rect;

      const width = rect.width * scale;
      const height = rect.height * scale;
      if (typeof DOMRect === 'function') return new DOMRect(rect.x, rect.y, width, height);
      return {
        x: rect.x,
        y: rect.y,
        top: rect.top,
        left: rect.left,
        right: rect.left + width,
        bottom: rect.top + height,
        width,
        height,
        toJSON: () => ({ x: rect.x, y: rect.y, width, height }),
      };
    };

    surfaceResolutionHookInstalled = true;
    layer.dataset.adaptiveResolution = 'true';
    document.documentElement.dataset.surfaceRenderScale = '1.00';
    return true;
  }

  function ensureSurfaceResolutionHook() {
    if (installAdaptiveSurfaceResolution()) return;
    requestAnimationFrame(ensureSurfaceResolutionHook);
  }
  requestAnimationFrame(ensureSurfaceResolutionHook);

  function updateAdaptiveQuality(now) {
    const dt = clamp(now - lastRaf, 1, 120);
    lastRaf = now;
    const active = Boolean(activePlayer());

    if (!active) {
      smoothedFrameMs += (16.7 - smoothedFrameMs) * 0.08;
      if (qualityLevel !== 0 && now - lastQualityChange > 1600) {
        qualityLevel--;
        lastQualityChange = now;
        stats.qualityChanges++;
      }
      requestAnimationFrame(updateAdaptiveQuality);
      return;
    }

    smoothedFrameMs += (dt - smoothedFrameMs) * 0.075;
    if (now - lastQualityChange >= QUALITY_CHANGE_COOLDOWN_MS) {
      let nextLevel = qualityLevel;
      if (smoothedFrameMs > 43) nextLevel = 3;
      else if (smoothedFrameMs > 34) nextLevel = Math.max(nextLevel, 2);
      else if (smoothedFrameMs > 27) nextLevel = Math.max(nextLevel, 1);
      else if (smoothedFrameMs < 21.5) nextLevel = Math.max(0, nextLevel - 1);

      if (nextLevel !== qualityLevel) {
        qualityLevel = nextLevel;
        lastQualityChange = now;
        stats.qualityChanges++;
        stats.peakQualityLevel = Math.max(stats.peakQualityLevel, qualityLevel);
        document.documentElement.dataset.surfacePerformanceLevel = String(qualityLevel);
      }
    }

    requestAnimationFrame(updateAdaptiveQuality);
  }
  requestAnimationFrame(updateAdaptiveQuality);

  const api = {
    installed: true,
    getStats: () => ({
      ...stats,
      terrainCacheSize: terrainCache.size,
      waterCacheSize: waterCache.size,
      frameBucketMs: FRAME_BUCKET_MS,
      terrainNearRadius: TERRAIN_NEAR_RADIUS,
      waterNearRadius: WATER_NEAR_RADIUS,
      smoothedFrameMs: Number(smoothedFrameMs.toFixed(2)),
      qualityLevel,
      detailMultiplier: detailMultiplier(),
      renderScale: renderScale(),
      adaptiveResolutionHookInstalled: surfaceResolutionHookInstalled,
      squaredDistanceHotPath: true,
    }),
    getQualityProfile: () => ({
      level: qualityLevel,
      smoothedFrameMs,
      detailMultiplier: detailMultiplier(),
      renderScale: renderScale(),
      nearFieldExact: true,
    }),
  };

  window.realitySandboxSurfacePerformance = api;
  document.documentElement.dataset.surfacePerformance = 'adaptive-distance-cache-resolution';
  document.documentElement.dataset.surfacePerformanceLevel = '0';
  document.documentElement.dataset.surfaceRenderScale = '1.00';

  const previousDiagnostics = window.realitySandboxPresentationDiagnostics;
  window.realitySandboxPresentationDiagnostics = () => ({
    ...(typeof previousDiagnostics === 'function' ? previousDiagnostics() : {}),
    surfacePerformance: 'adaptive-distance-cache-resolution',
    surfacePerformanceStats: api.getStats(),
  });
}

async function boot() {
  for (let attempt = 0; attempt < 240; attempt++) {
    const planet = window.realitySandboxPlanet;
    if (planet?.world && planet?.living?.sampleDynamicPlanet && planet?.waterCycle?.sample) {
      installSamplerCache(planet);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

boot();
