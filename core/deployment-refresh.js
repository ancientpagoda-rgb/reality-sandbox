const VERSION_ENDPOINT = './version.json';
const CHECK_TIMEOUT_MS = 5000;
const WEATHER_REFRESH_MS = 500;
const RAIN_PRESENTATION_FLOOR = 0.00012;

function normalizeSha(value) {
  return String(value || '').trim().toLowerCase();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function fetchCurrentDeployment() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    const url = `${VERSION_ENDPOINT}?t=${Date.now()}`;
    const response = await fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return normalizeSha(payload?.sha);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function verifyDeploymentFreshness() {
  const meta = document.querySelector('meta[name="reality-sandbox-deploy-sha"]');
  const loadedSha = normalizeSha(meta?.content);
  if (!loadedSha) return;

  document.documentElement.dataset.loadedDeploySha = loadedSha;
  const currentSha = await fetchCurrentDeployment();
  if (!currentSha) {
    document.documentElement.dataset.deploymentFreshness = 'unknown';
    return;
  }

  document.documentElement.dataset.currentDeploySha = currentSha;
  if (currentSha === loadedSha) {
    document.documentElement.dataset.deploymentFreshness = 'current';
    return;
  }

  document.documentElement.dataset.deploymentFreshness = 'stale';
  const guardKey = `reality-sandbox-refresh:${currentSha}`;
  if (sessionStorage.getItem(guardKey) === '1') return;
  sessionStorage.setItem(guardKey, '1');

  const url = new URL(location.href);
  url.searchParams.set('deploy', currentSha.slice(0, 12));
  url.searchParams.set('refresh', String(Date.now()));
  location.replace(url.href);
}

async function installRainWeatherCache() {
  try {
    await window.realitySandboxReady;
  } catch {
    return;
  }

  const dynamics = window.realitySandboxPlanet?.dynamics;
  if (!dynamics?.getWeather || dynamics.__rainWeatherCacheInstalled) return;

  const nativeGetWeather = dynamics.getWeather.bind(dynamics);
  let cache = [];
  let lastRefresh = -Infinity;

  dynamics.getWeather = () => {
    const now = performance.now();
    if (now - lastRefresh < WEATHER_REFRESH_MS) return cache;
    lastRefresh = now;
    cache = (nativeGetWeather() || [])
      .filter(cell => Math.max(0, Number(cell?.rain) || 0) >= RAIN_PRESENTATION_FLOOR)
      .map(cell => {
        const rain = Math.max(0, Number(cell.rain) || 0);
        const strength = clamp(Math.log1p(rain * 900) / Math.log1p(7.2), 0.08, 1);
        return {
          ...cell,
          strength,
          radius: 12 + strength * 34,
          type: rain > 0.006 || cell.flood > 0.6 ? 'storm' : 'rain',
        };
      });
    document.documentElement.dataset.totalRainCells = String(cache.length);
    return cache;
  };

  dynamics.__rainWeatherCacheInstalled = true;
  dynamics.getWeather();
}

verifyDeploymentFreshness();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installRainWeatherCache, { once: true });
} else {
  installRainWeatherCache();
}
