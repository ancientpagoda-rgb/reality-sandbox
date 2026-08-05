import { samplePlanet } from './planet.js';
import { sampleHydrology } from './hydrology.js';

const SAMPLE_WIDTH = 8192;
const SAMPLE_HEIGHT = 4096;
const TECHNOLOGY_STEPS = [
  ['fire', 0.12],
  ['storage', 0.2],
  ['crafting', 0.3],
  ['agriculture', 0.4],
  ['roads', 0.5],
  ['writing', 0.62],
  ['metallurgy', 0.78],
];

export function createHeadlessCivilizationEngine(world, evolution, options = {}) {
  const mobile = options.mobile ?? false;
  const communities = new Map();
  const routes = new Map();
  const events = [];
  const restored = new Map();
  let elapsed = 0;
  let syncClock = 0;
  let nextEvent = 1;
  let destroyed = false;

  const network = {
    get order() { return communities.size; },
    get size() { return routes.size; },
    nodes: () => [...communities.keys()],
    edges: () => [...routes.keys()],
    clear() {
      communities.clear();
      routes.clear();
    },
  };

  function initialize({ provideCapability }) {
    provideCapability('civilization.emergent', api);
    provideCapability('culture.lineages', api);
    provideCapability('language.evolution', api);
    provideCapability('history.observatory', api);
    provideCapability('networks.graphology', network);
  }

  function step(dt) {
    if (destroyed) return;
    const amount = Math.max(0, dt);
    elapsed += amount;
    syncClock += amount;
    if (syncClock < (mobile ? 1.8 : 1.05) && communities.size) return;
    const cycle = Math.max(syncClock, amount);
    syncClock = 0;
    synchronize(cycle);
  }

  function synchronize(dt) {
    const species = evolution.getSpecies?.() || [];
    const speciesById = new Map(species.map(item => [item.id, item]));
    const settlements = (evolution.getStructures?.() || []).filter(item => item.type === 'settlement');
    const seen = new Set();

    for (const settlement of settlements) {
      const seed = {
        id: settlement.id,
        speciesId: settlement.speciesId,
        x: settlement.x,
        y: settlement.y,
        population: Math.max(1, settlement.population || speciesById.get(settlement.speciesId)?.members || 1),
        progress: settlement.progress || 0.2,
        synthetic: false,
      };
      upsertCommunity(seed, speciesById.get(seed.speciesId), dt, seen);
    }

    if (!settlements.length && elapsed >= 1.8) {
      const founder = species
        .filter(item => item.role === 'agent' && item.members > 0)
        .sort((a, b) => b.members - a.members || a.id.localeCompare(b.id))[0];
      if (founder) {
        const seed = {
          id: `lofi-${founder.id}`,
          speciesId: founder.id,
          x: finite(founder.centroidX, world.width * 0.5),
          y: finite(founder.centroidY, world.height * 0.5),
          population: Math.max(1, founder.members),
          progress: clamp((elapsed - 1.8) * 0.018 + 0.16, 0.16, 0.72),
          synthetic: true,
        };
        upsertCommunity(seed, founder, dt, seen);
      }
    }

    for (const community of communities.values()) {
      if (seen.has(community.id)) {
        community.lastSeen = elapsed;
        community.abandonment = Math.max(0, community.abandonment - dt * 0.08);
        if (community.status === 'abandoned') community.status = 'recovering';
      } else {
        community.abandonment += dt * 0.035;
        if (community.abandonment > 1) community.status = 'abandoned';
      }
    }

    rebuildRoutes();
    world.globals.civilizationPressure = clamp(
      [...communities.values()].reduce((sum, item) => sum + item.environmentalImpact, 0),
      0,
      25,
    );
    world.globals.anthropogenicImpact = clamp(
      [...communities.values()].reduce((sum, item) => sum + item.climateImpact, 0),
      0,
      1,
    );
  }

  function upsertCommunity(seed, species, dt, seen) {
    seen.add(seed.id);
    let community = communities.get(seed.id);
    if (!community) {
      community = restoreOrCreate(seed, species);
      communities.set(seed.id, community);
      record('Settlement enters history', `${community.name} emerged as a persistent community.`, 'settlement', community.id);
    }

    const environment = sampleEnvironment(seed.x, seed.y);
    const targetPopulation = Math.max(1, seed.population || species?.members || 1);
    community.x = wrap(seed.x, world.width);
    community.y = clamp(seed.y, 0, world.height);
    community.population += (targetPopulation - community.population) * clamp(dt * 0.16, 0, 0.45);
    community.phasePopulation = targetPopulation;
    community.progress = seed.progress;
    community.synthetic = seed.synthetic;
    community.environment = environment;
    community.carryingCapacity = Math.max(4, 8 + environment.moisture * 24 + environment.land * 18);
    community.food = clamp(environment.moisture * 0.42 + environment.temperature * 0.2 + community.progress * 0.32, 0.05, 1.4);
    community.storedFood = clamp(community.storedFood + dt * (community.food - 0.45) * 0.02, 0, 3);
    community.waterSecurity = clamp(environment.moisture * 0.72 + environment.water * 0.45, 0, 1);
    community.materials = clamp(environment.elevation * 0.45 + community.progress * 0.42, 0, 1);
    community.knowledge = clamp(community.knowledge + dt * (0.004 + community.progress * 0.003), 0, 2);
    community.trade = clamp(community.trade + dt * communities.size * 0.0008, 0, 1);
    community.conflict = clamp(community.conflict * (1 - dt * 0.012), 0, 1);
    community.health = clamp(0.45 + community.waterSecurity * 0.28 + community.food * 0.18, 0, 1);
    community.surplus = clamp(community.food + community.storedFood * 0.22 - community.population / Math.max(1, community.carryingCapacity), -1, 1);
    community.stress = clamp(
      Math.max(0, community.population / Math.max(1, community.carryingCapacity) - 0.72)
        + (1 - community.food) * 0.25
        + (1 - community.waterSecurity) * 0.2,
      0,
      1,
    );
    community.stability = clamp(0.48 + community.health * 0.25 + community.surplus * 0.14 - community.stress * 0.35, 0, 1);
    community.fireMastery = clamp(community.fireMastery + (community.technologies.has('fire') ? dt * 0.006 : 0), 0, 1);
    community.environmentalImpact = clamp(
      community.environmentalImpact + dt * (community.population / 80) * (0.0008 + community.technologies.size * 0.00018),
      0,
      1.5,
    );
    community.climateImpact = community.environmentalImpact * community.population * 0.00004;
    community.status = community.stress > 0.84 ? 'strained' : community.status === 'recovering' ? 'recovering' : 'growing';

    for (const [technology, threshold] of TECHNOLOGY_STEPS) {
      if (community.knowledge + community.progress * 0.42 >= threshold) community.technologies.add(technology);
    }
    if (community.technologies.has('fire')) community.buildings.add('hearth');
    if (community.technologies.has('storage')) community.buildings.add('storehouse');
    if (community.technologies.has('roads')) community.buildings.add('road');
  }

  function restoreOrCreate(seed, species) {
    const saved = restored.get(seed.id);
    if (saved) {
      restored.delete(seed.id);
      return normalizeCommunity({ ...saved, x: seed.x, y: seed.y, speciesId: seed.speciesId });
    }
    const suffix = hashString(seed.id).toString(36).slice(0, 4).toUpperCase();
    return normalizeCommunity({
      id: seed.id,
      name: `${titleCase(seed.speciesId)} ${suffix}`,
      speciesId: seed.speciesId,
      x: seed.x,
      y: seed.y,
      foundedAt: elapsed,
      lastSeen: elapsed,
      status: 'growing',
      population: Math.max(1, seed.population || species?.members || 1),
      phasePopulation: Math.max(1, seed.population || species?.members || 1),
      languageId: `language-${seed.speciesId}`,
      cultureId: `culture-${seed.speciesId}`,
      polityId: null,
      leaderId: null,
      progress: seed.progress,
      synthetic: seed.synthetic,
    });
  }

  function rebuildRoutes() {
    routes.clear();
    const active = [...communities.values()]
      .filter(item => item.status !== 'abandoned')
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, mobile ? 10 : 24);
    for (let aIndex = 0; aIndex < active.length; aIndex++) {
      for (let bIndex = aIndex + 1; bIndex < active.length; bIndex++) {
        const a = active[aIndex];
        const b = active[bIndex];
        const distance = Math.sqrt(torusDistance(a, b, world.width, world.height));
        if (distance > 340) continue;
        const edgeId = `${a.id}::${b.id}`;
        const flow = clamp((1 - distance / 340) * (a.stability + b.stability) * 0.36, 0, 1);
        routes.set(edgeId, {
          edgeId,
          from: a.id,
          to: b.id,
          distance,
          flow,
          trust: clamp((a.stability + b.stability) * 0.45, 0, 1),
          knowledge: clamp((a.knowledge + b.knowledge) * 0.22, 0, 1),
          migration: clamp((a.stress + b.stress) * 0.18 + flow * 0.3, 0, 1),
          kind: 'exchange',
        });
        a.trade = Math.max(a.trade, flow);
        b.trade = Math.max(b.trade, flow);
      }
    }
  }

  function sampleEnvironment(x, y) {
    const u = wrap(x / world.width, 1);
    const v = clamp(y / world.height, 0, 1);
    const planet = samplePlanet(u * SAMPLE_WIDTH, v * SAMPLE_HEIGHT, SAMPLE_WIDTH, SAMPLE_HEIGHT);
    const hydro = sampleHydrology(u * SAMPLE_WIDTH, v * SAMPLE_HEIGHT, SAMPLE_WIDTH, SAMPLE_HEIGHT);
    const water = clamp(Math.max(hydro.river, hydro.lake, hydro.delta), 0, 1);
    return {
      temperature: planet.temperature,
      moisture: clamp(planet.rainfall * 0.76 + water * 0.34, 0, 1),
      elevation: planet.elevation,
      water,
      land: planet.elevation > 0.5 ? 1 : 0,
    };
  }

  function getState() {
    const active = [...communities.values()].filter(item => item.status !== 'abandoned');
    return {
      elapsed,
      communities: active.length,
      archaeologicalSites: communities.size - active.length,
      languages: new Set(active.map(item => item.languageId)).size,
      languageFamilies: new Set(active.map(item => item.speciesId)).size,
      cultures: new Set(active.map(item => item.cultureId)).size,
      polities: new Set(active.map(item => item.polityId).filter(Boolean)).size,
      routes: routes.size,
      technologies: new Set(active.flatMap(item => [...item.technologies])).size,
      migrations: 0,
      population: active.reduce((sum, item) => sum + item.population, 0),
      historyEvents: events.length,
      graphology: false,
      mode: 'headless',
    };
  }

  function record(title, description, type, communityId) {
    const event = {
      id: `headless-history-${nextEvent++}`,
      title,
      description,
      type,
      communityId,
      at: elapsed,
      tick: world.tick,
      date: new Date().toISOString(),
    };
    events.unshift(event);
    if (events.length > 320) events.length = 320;
    window.dispatchEvent(new CustomEvent('civilization-history', { detail: event }));
  }

  const api = {
    id: 'civilization.emergent-graphology',
    name: 'Headless Languages, Cultures, and Civilizations',
    version: '1.0.0',
    execution: 'browser-headless-deterministic',
    source: 'Reality Sandbox deterministic community, language, culture, trade, and history simulation without Three.js visuals',
    license: 'Project license',
    provides: ['civilization.emergent', 'culture.lineages', 'language.evolution', 'history.observatory', 'networks.graphology'],
    requires: ['evolution.embodied', 'evolution.lineages'],
    after: ['evolution.headless-lineages'],
    initialize,
    step,
    render() {},
    save() {
      return {
        version: 1,
        elapsed,
        nextEvent,
        communities: [...communities.values()].map(serializeCommunity),
        routes: [...routes.values()].map(item => ({ ...item })),
        events: events.slice(0, 320),
      };
    },
    load(state = {}) {
      elapsed = Math.max(0, state.elapsed || 0);
      nextEvent = Math.max(1, state.nextEvent || 1);
      for (const item of state.communities || []) restored.set(item.id, item);
      for (const item of state.events || []) events.push(item);
    },
    getState,
    getCommunities: () => [...communities.values()].map(serializeCommunity),
    getRoutes: () => [...routes.values()].map(item => ({ ...item })),
    getLanguages: () => [...communities.values()].map(item => ({ id: item.languageId, speciesId: item.speciesId, extinctAt: item.status === 'abandoned' ? elapsed : null, lexicon: {}, grammar: {} })),
    getCultures: () => [...communities.values()].map(item => ({ id: item.cultureId, speciesId: item.speciesId, norms: {}, traditions: {} })),
    getHistory: () => events.slice(),
    destroy() {
      destroyed = true;
      network.clear();
    },
  };

  return api;
}

function normalizeCommunity(value) {
  return {
    id: value.id,
    name: value.name || value.id,
    speciesId: value.speciesId || 'agent',
    x: finite(value.x, 0),
    y: finite(value.y, 0),
    foundedAt: Math.max(0, value.foundedAt || 0),
    lastSeen: Math.max(0, value.lastSeen || 0),
    status: value.status || 'growing',
    population: Math.max(1, value.population || 1),
    phasePopulation: Math.max(1, value.phasePopulation || value.population || 1),
    languageId: value.languageId || `language-${value.speciesId || 'agent'}`,
    cultureId: value.cultureId || `culture-${value.speciesId || 'agent'}`,
    polityId: value.polityId || null,
    leaderId: value.leaderId || null,
    roles: { ...(value.roles || {}) },
    technologies: new Set(value.technologies || []),
    buildings: new Set(value.buildings || ['shelter']),
    inventions: [...(value.inventions || [])],
    history: [...(value.history || [])],
    progress: clamp(value.progress ?? 0.2, 0, 1),
    synthetic: Boolean(value.synthetic),
    storedFood: Math.max(0, value.storedFood || 0.1),
    food: clamp(value.food ?? 0.5, 0, 1.4),
    waterSecurity: clamp(value.waterSecurity ?? 0.5, 0, 1),
    carryingCapacity: Math.max(4, value.carryingCapacity || 12),
    health: clamp(value.health ?? 0.6, 0, 1),
    knowledge: Math.max(0, value.knowledge || 0.08),
    trade: clamp(value.trade || 0, 0, 1),
    conflict: clamp(value.conflict || 0, 0, 1),
    stability: clamp(value.stability ?? 0.58, 0, 1),
    stress: clamp(value.stress || 0, 0, 1),
    surplus: clamp(value.surplus || 0, -1, 1),
    materials: clamp(value.materials ?? 0.3, 0, 1),
    fireMastery: clamp(value.fireMastery || 0, 0, 1),
    environmentalImpact: clamp(value.environmentalImpact || 0, 0, 1.5),
    climateImpact: Math.max(0, value.climateImpact || 0),
    abandonment: Math.max(0, value.abandonment || 0),
    environment: { ...(value.environment || {}) },
  };
}

function serializeCommunity(value) {
  return {
    ...value,
    roles: { ...value.roles },
    technologies: [...value.technologies],
    buildings: [...value.buildings],
    inventions: [...value.inventions],
    history: [...value.history],
    environment: { ...value.environment },
  };
}

function torusDistance(a, b, width, height) {
  const dx = shortest((b.x || 0) - (a.x || 0), width);
  const dy = shortest((b.y || 0) - (a.y || 0), height);
  return dx * dx + dy * dy;
}

function shortest(delta, period) {
  if (delta > period * 0.5) return delta - period;
  if (delta < -period * 0.5) return delta + period;
  return delta;
}

function titleCase(value) {
  return String(value || 'community')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function hashString(text) {
  let hash = 2166136261;
  for (const character of String(text)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

const wrap = (value, max) => ((value % max) + max) % max;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));