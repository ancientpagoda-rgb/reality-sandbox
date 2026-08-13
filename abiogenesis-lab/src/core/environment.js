import { hashSeed } from './rng.js';

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

function noise(x, y, seed) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smoothNoise(x, y, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const tx = x - x0, ty = y - y0;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = noise(x0, y0, seed), b = noise(x0 + 1, y0, seed);
  const c = noise(x0, y0 + 1, seed), d = noise(x0 + 1, y0 + 1, seed);
  return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
}

function fractal(x, y, seed) {
  return smoothNoise(x, y, seed) * 0.62
    + smoothNoise(x * 2.1, y * 2.1, seed ^ 991) * 0.27
    + smoothNoise(x * 4.2, y * 4.2, seed ^ 1777) * 0.11;
}

export function createPlanetEnvironment({ columns = 24, rows = 12, seed = 1, planet = {} } = {}) {
  const numericSeed = hashSeed(seed);
  const size = columns * rows;
  const environment = Object.fromEntries([
    'water', 'minerals', 'hydrothermal', 'wetDry', 'ultraviolet', 'temperature', 'land'
  ].map(name => [name, new Float32Array(size)]));
  const waterInventory = clamp(Number(planet.waterFraction ?? 0.34), 0, 1);
  const atmosphere = clamp(Number(planet.atmosphereRetention ?? 0.63), 0, 1);

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const index = row * columns + column;
      const u = (column + 0.5) / columns;
      const v = (row + 0.5) / rows;
      const latitude = (0.5 - v) * Math.PI;
      const continental = fractal(u * 4.2, v * 3.1, numericSeed) + Math.sin(u * 19 + v * 4) * 0.11;
      const land = continental > 0.5 + (waterInventory - 0.34) * 0.28;
      const coast = clamp(1 - Math.abs(continental - 0.5) * 12);
      const plate = clamp((fractal(u * 10, v * 7, numericSeed ^ 83) - 0.45) * 1.9);
      const vent = clamp(plate * 0.8 + fractal(u * 17, v * 12, numericSeed ^ 31) * 0.22 - 0.05);
      const rain = clamp(0.42 + Math.cos(latitude) * 0.34 + fractal(u * 7, v * 5, numericSeed ^ 7) * 0.2);
      const uvShield = 0.35 + atmosphere * 0.65;

      environment.land[index] = land ? 1 : 0;
      environment.water[index] = land ? clamp(coast * 0.35 + rain * 0.14, 0.02, 0.65) : 1;
      environment.wetDry[index] = clamp(coast * 0.82 + (land ? rain * 0.22 : 0.03));
      environment.hydrothermal[index] = vent;
      environment.minerals[index] = clamp(0.18 + plate * 0.67 + continental * 0.18);
      environment.temperature[index] = clamp(0.3 + Math.cos(latitude) * 0.4 + vent * 0.12);
      environment.ultraviolet[index] = clamp((0.25 + Math.cos(latitude) * 0.68) / uvShield, 0.04, 1.5);
    }
  }

  return { columns, rows, size, environment };
}
