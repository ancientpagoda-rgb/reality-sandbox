// Simple deterministic RNG (Mulberry32) with string seed support.

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStringToInt(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createRng(seedStr) {
  const seedInt = hashStringToInt(seedStr || 'default-seed');
  const base = mulberry32(seedInt);
  const rng = () => base();

  rng.float = () => base();
  rng.int = (min, max) => {
    const t = base();
    return Math.floor(min + t * (max - min + 1));
  };
  rng.choice = (arr) => arr[Math.floor(base() * arr.length)];

  return rng;
}
