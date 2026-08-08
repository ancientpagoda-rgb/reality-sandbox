const FRAME_BUCKET_MS = 42;
const TERRAIN_NEAR_RADIUS = 52;
const TERRAIN_MID_RADIUS = 108;
const TERRAIN_FAR_RADIUS = 158;
const WATER_NEAR_RADIUS = 46;
const WATER_MID_RADIUS = 96;
const WATER_FAR_RADIUS = 142;
const MAX_CACHE_ENTRIES = 14000;

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

function detailStep(distance, kind) {
  if (kind === 'water') {
    if (distance <= WATER_NEAR_RADIUS) return 0;
    if (distance <= WATER_MID_RADIUS) return 0.35;
    if (distance <= WATER_FAR_RADIUS) return 0.8;
    return 1.45;
  }

  if (distance <= TERRAIN_NEAR_RADIUS) return 0;
  if (distance <= TERRAIN_MID_RADIUS) return 0.25;
  if (distance <= TERRAIN_FAR_RADIUS) return 0.6;
  return 1.15;
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
  const stats = {
    terrainHits: 0,
    terrainMisses: 0,
    waterHits: 0,
    waterMisses: 0,
    terrainQuantized: 0,
    waterQuantized: 0,
    cacheResets: 0,
  };

  function activePlayer() {
    const mode = window.realitySandboxSurfaceMode;
    if (!mode?.isActive?.()) return null;
    return mode.getPlayer?.() || null;
  }

  function beginBucket() {
    const nextBucket = Math.floor(performance.now() / FRAME_BUCKET_MS);
    if (nextBucket === bucket) return;
    bucket = nextBucket;
    terrainCache.clear();
    waterCache.clear();
    stats.cacheResets++;
  }

  function sampleWithCache(kind, x, y, original) {
    const player = activePlayer();
    if (!player || !Number.isFinite(x) || !Number.isFinite(y)) return original(x, y);

    beginBucket();

    const wrappedX = wrap(x, world.width);
    const clampedY = clamp(y, 0, world.height);
    const dx = shortestWrappedDelta(wrappedX, player.x, world.width);
    const dy = clampedY - player.y;
    const distance = Math.hypot(dx, dy);
    const step = detailStep(distance, kind);
    const sampleX = step ? wrap(quantize(wrappedX, step), world.width) : wrappedX;
    const sampleY = step ? clamp(quantize(clampedY, step), 0, world.height) : clampedY;
    const cache = kind === 'water' ? waterCache : terrainCache;
    const key = step
      ? `${step}:${Math.round(sampleX / step)}:${Math.round(sampleY / step)}`
      : `${sampleX.toFixed(4)}:${sampleY.toFixed(4)}`;

    if (cache.has(key)) {
      if (kind === 'water') stats.waterHits++;
      else stats.terrainHits++;
      return cache.get(key);
    }

    if (kind === 'water') {
      stats.waterMisses++;
      if (step) stats.waterQuantized++;
    } else {
      stats.terrainMisses++;
      if (step) stats.terrainQuantized++;
    }

    const value = original(sampleX, sampleY);
    if (cache.size < MAX_CACHE_ENTRIES) cache.set(key, value);
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

  const api = {
    installed: true,
    getStats: () => ({
      ...stats,
      terrainCacheSize: terrainCache.size,
      waterCacheSize: waterCache.size,
      frameBucketMs: FRAME_BUCKET_MS,
      terrainNearRadius: TERRAIN_NEAR_RADIUS,
      waterNearRadius: WATER_NEAR_RADIUS,
    }),
  };

  window.realitySandboxSurfacePerformance = api;
  document.documentElement.dataset.surfacePerformance = 'distance-aware-cache';

  const previousDiagnostics = window.realitySandboxPresentationDiagnostics;
  window.realitySandboxPresentationDiagnostics = () => ({
    ...(typeof previousDiagnostics === 'function' ? previousDiagnostics() : {}),
    surfacePerformance: 'distance-aware-cache',
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
