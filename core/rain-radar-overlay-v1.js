const TAU = Math.PI * 2;
const GLOBE_RADIUS_FACTOR = 0.43;
const RAIN_FLOOR = 0.00012;
const MAX_RADAR_CELLS = 180;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

async function installRainRadarOverlay() {
  try {
    await window.realitySandboxReady;
  } catch {
    return;
  }

  const runtime = window.realitySandboxUnified;
  const planet = window.realitySandboxPlanet;
  const world = planet?.world;
  const dynamics = planet?.dynamics;
  const sourceCanvas = document.getElementById('lofiLivingCanvas');
  const host = sourceCanvas?.parentElement;
  if (!runtime?.render || !runtime?.getCamera || !world || !dynamics?.getWeather || !sourceCanvas || !host) return;
  if (runtime.__rainRadarOverlayInstalled) return;

  const oldWeatherCanvas = document.getElementById('weatherPresentationCanvas');
  if (oldWeatherCanvas) oldWeatherCanvas.style.visibility = 'hidden';

  const canvas = document.createElement('canvas');
  canvas.id = 'rainRadarCanvas';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    zIndex: '2',
    pointerEvents: 'none',
    imageRendering: 'auto',
  });
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
  const nativeGetWeather = dynamics.getWeather.bind(dynamics);

  function syncSize() {
    const width = Math.max(1, sourceCanvas.width);
    const height = Math.max(1, sourceCanvas.height);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const oldCanvas = document.getElementById('weatherPresentationCanvas');
    if (oldCanvas) oldCanvas.style.visibility = 'hidden';
  }

  function project(worldX, worldY, camera, width, height) {
    const radius = Math.min(width, height) * GLOBE_RADIUS_FACTOR * camera.zoom;
    const cx = width * 0.5;
    const cy = height * 0.5;
    const lon = (worldX / world.width - 0.5) * TAU;
    const lat = (0.5 - worldY / world.height) * Math.PI;
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
    return { x: cx + x * radius, y: cy - y * radius, depth: z, visible: z > 0, radius };
  }

  function rainStrength(cell) {
    const rain = Math.max(0, Number(cell?.rain) || 0);
    if (rain < RAIN_FLOOR) return 0;
    return clamp(Math.log1p(rain * 900) / Math.log1p(7.2), 0.08, 1);
  }

  function radarColor(strength) {
    if (strength >= 0.93) return '#d82ed0';
    if (strength >= 0.82) return '#ff3f38';
    if (strength >= 0.68) return '#ff9f32';
    if (strength >= 0.52) return '#f4e64b';
    if (strength >= 0.32) return '#48df5b';
    return '#35bd72';
  }

  function rgba(hex, alpha) {
    const value = Number.parseInt(hex.slice(1), 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `rgba(${r},${g},${b},${clamp(alpha, 0, 1)})`;
  }

  function drawPatch(x, y, radius, strength, depth, phase) {
    const alpha = clamp(0.30 + depth * 0.62, 0.12, 0.92);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(phase * 1.7) * 0.16);

    ctx.fillStyle = rgba(radarColor(strength * 0.72), (0.30 + strength * 0.22) * alpha);
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 1.18, radius * 0.78, 0, 0, TAU);
    ctx.fill();

    const lobes = 3 + Math.floor(strength * 4);
    for (let index = 0; index < lobes; index++) {
      const angle = phase + index * 2.3999632297;
      const lobeStrength = clamp(strength + Math.sin(phase * 3 + index * 1.9) * 0.10, 0.08, 1);
      const distance = radius * (0.10 + (index % 3) * 0.09);
      const lobeRadius = radius * (0.46 + 0.10 * ((index + 1) % 3));
      ctx.fillStyle = rgba(radarColor(lobeStrength), (0.34 + lobeStrength * 0.28) * alpha);
      ctx.beginPath();
      ctx.ellipse(
        Math.cos(angle) * distance,
        Math.sin(angle) * distance * 0.72,
        lobeRadius,
        lobeRadius * (0.62 + 0.10 * (index % 2)),
        angle * 0.18,
        0,
        TAU,
      );
      ctx.fill();
    }

    if (strength >= 0.52) {
      ctx.fillStyle = rgba(radarColor(clamp(strength + 0.14, 0, 1)), (0.45 + strength * 0.28) * alpha);
      ctx.beginPath();
      ctx.ellipse(radius * 0.06, -radius * 0.04, radius * 0.38, radius * 0.25, -0.12, 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawRadar() {
    if (!ctx) return;
    syncSize();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (sourceCanvas.dataset.dragging === 'true') return;

    const camera = runtime.getCamera();
    const weather = nativeGetWeather() || [];
    let rainCells = 0;
    let visible = 0;

    for (const cell of weather) {
      const strength = rainStrength(cell);
      if (strength <= 0) continue;
      rainCells += 1;
      if (visible >= MAX_RADAR_CELLS) continue;

      const point = project(cell.x, cell.y, camera, canvas.width, canvas.height);
      if (!point.visible) continue;

      const radius = Math.max(5, Math.round((18 + strength * 38) / world.width * point.radius * 2.7));
      const phase = ((cell.x * 0.754877666 + cell.y * 0.569840296) % 1) * TAU;
      drawPatch(point.x, point.y, radius, strength, point.depth, phase);
      visible += 1;
    }

    document.documentElement.dataset.weatherPresentation = 'rain-radar';
    document.documentElement.dataset.rainRadarOnly = 'true';
    document.documentElement.dataset.totalRainCells = String(rainCells);
    document.documentElement.dataset.visibleRainRadarCells = String(visible);
  }

  const previousRender = runtime.render.bind(runtime);
  runtime.render = frame => {
    const result = previousRender(frame);
    drawRadar();
    return result;
  };

  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(drawRadar) : null;
  observer?.observe(sourceCanvas);
  window.addEventListener('resize', drawRadar, { passive: true });

  runtime.__rainRadarOverlayInstalled = true;
  window.realitySandboxRainRadar = {
    ready: true,
    mode: 'simulated-rain-only',
    render: drawRadar,
    getState: () => ({
      rainRadarOnly: true,
      totalRainCells: Number(document.documentElement.dataset.totalRainCells || 0),
      visibleCells: Number(document.documentElement.dataset.visibleRainRadarCells || 0),
    }),
  };

  drawRadar();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installRainRadarOverlay, { once: true });
} else {
  installRainRadarOverlay();
}
