import { createRng } from './core/rng.js';
import { createWorld } from './core/world.js';
import { createRenderer } from './core/render.js';

const FIXED_DT = 0.06; // 60 ms in seconds, fixed sim step

let seed = null;
let rng = null;
let world = null;
let renderer = null;

let running = false;
let accumulator = 0;
let lastTime = 0;

function updateLabels() {
  const tickLabel = document.getElementById('tickLabel');
  const seedValue = document.getElementById('seedValue');
  if (tickLabel) tickLabel.textContent = `Tick: ${world.tick}`;
  if (seedValue) seedValue.textContent = seed;
}

function mainLoop(timestamp) {
  if (!running) return;

  if (!lastTime) lastTime = timestamp;
  const deltaMs = timestamp - lastTime;
  lastTime = timestamp;

  accumulator += deltaMs / 1000; // seconds

  while (accumulator >= FIXED_DT) {
    world.step(FIXED_DT);
    accumulator -= FIXED_DT;
  }

  renderer.render(world);
  updateLabels();

  requestAnimationFrame(mainLoop);
}

function start() {
  if (running) return;
  running = true;
  lastTime = 0;
  accumulator = 0;
  document.getElementById('startButton').disabled = true;
  document.getElementById('pauseButton').disabled = false;
  document.getElementById('stepButton').disabled = true;
  requestAnimationFrame(mainLoop);
}

function pause() {
  running = false;
  document.getElementById('startButton').disabled = false;
  document.getElementById('pauseButton').disabled = true;
  document.getElementById('stepButton').disabled = false;
}

function stepOnce() {
  if (!world) return;
  world.step(FIXED_DT);
  renderer.render(world);
  updateLabels();
}

function init() {
  // Seeded RNG: use current timestamp, but allow deterministic replay by copying the value.
  seed = Date.now().toString(36);
  rng = createRng(seed);
  world = createWorld(rng);
  renderer = createRenderer(document.getElementById('world'));

  updateLabels();

  const startBtn = document.getElementById('startButton');
  const pauseBtn = document.getElementById('pauseButton');
  const stepBtn = document.getElementById('stepButton');

  startBtn.addEventListener('click', start);
  pauseBtn.addEventListener('click', pause);
  stepBtn.addEventListener('click', stepOnce);

  // Initial render (paused)
  renderer.render(world);
}

window.addEventListener('DOMContentLoaded', init);
