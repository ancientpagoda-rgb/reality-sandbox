import { samplePlanet } from './planet.js';
import { sampleHydrology } from './hydrology.js';
import { createGeologicalTime } from './geological-time.js';
import { createEvolutionLedger } from './evolution-lineages.js';

const SAMPLE_WIDTH = 8192;
const SAMPLE_HEIGHT = 4096;

export function createHeadlessEvolution(world, originSystem, options = {}) {
  const mobile = options.mobile ?? false;
  const geology = createGeologicalTime({
    seed: options.geologySeed || 90210,
    startAgeMyr: 0,
    millionYearsPerSecond: 0.18,
  });
  const ledger = createEvolutionLedger(world, {
    seed: (options.seed ?? 0x260806) ^ 0x9E3779B9,
    mobile,
  });
  let destroyed = false;

  function sampleSurface(u, v) {
    u = wrap(u, 1);
    v = clamp(v, 0, 1);
    const base = samplePlanet(u * SAMPLE_WIDTH, v * SAMPLE_HEIGHT, SAMPLE_WIDTH, SAMPLE_HEIGHT);
    const hydro = sampleHydrology(u * SAMPLE_WIDTH, v * SAMPLE_HEIGHT, SAMPLE_WIDTH, SAMPLE_HEIGHT);
    const geological = geology.sample(u, v);
    const height = base.elevation + geological.uplift - geological.rifting - geological.erosion;
    const seaLevel = geological.seaLevel;
    const water = height < 0.53 + seaLevel;
    const waterStrength = water ? 1 : clamp(Math.max(hydro.lake, hydro.delta * 0.9, hydro.river * 0.78), 0, 1);
    return { ...base, ...hydro, ...geological, height, seaLevel, water, waterStrength };
  }

  function sampleNiche(x, y) {
    const surface = sampleSurface(x / world.width, y / world.height);
    return {
      temperature: surface.temperature,
      moisture: clamp(surface.rainfall * 0.7 + surface.river * 0.18 + surface.lake * 0.12, 0, 1),
      elevation: clamp(surface.height, 0, 1),
      water: surface.waterStrength,
      land: !surface.water && surface.waterStrength < 0.72,
    };
  }

  function initialize({ provideCapability }) {
    provideCapability('evolution.embodied', api);
    provideCapability('evolution.lineages', ledger);
    provideCapability('evolution.societies', api);
  }

  function step(dt) {
    if (destroyed) return;
    geology.step(dt);
    ledger.step(dt, sampleNiche);
  }

  function getState() {
    return {
      ...ledger.getState(),
      mode: 'headless-lineages',
      originAnimalsReady: Boolean(originSystem.getState?.().animalsReady),
      fullSimulationCount: 0,
      physicsReady: false,
      renderedStructures: 0,
    };
  }

  const api = {
    id: 'evolution.headless-lineages',
    name: 'Headless Embodied Evolution',
    version: '1.0.0',
    execution: 'browser-headless-deterministic',
    source: 'Reality Sandbox lineage, natural-selection, culture, and settlement simulation without Three.js, Yuka, or local Rapier bodies',
    license: 'Project license',
    provides: ['evolution.embodied', 'evolution.lineages', 'evolution.societies'],
    requires: ['origin.abiogenesis'],
    initialize,
    step,
    render() {},
    save() { return { version: 1, geology: geology.save?.() || {}, ledger: ledger.save() }; },
    load(state = {}) {
      geology.load?.(state.geology || {});
      ledger.load(state.ledger || state);
    },
    getState,
    getSpecies: ledger.getSpecies,
    getStructures: ledger.getStructures,
    getCommunication: ledger.getCommunication,
    getGenome: ledger.getGenome,
    getRecord: ledger.getRecord,
    destroy() { destroyed = true; },
  };

  return api;
}

const wrap = (value, max) => ((value % max) + max) % max;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));