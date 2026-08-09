import { samplePlanet } from './planet.js';
import { sampleHydrology } from './hydrology.js';

const TICK_MS = 700;
const NICHE_CACHE_CELL = 18;
const NICHE_CACHE_LIMIT = 4096;
const HABITAT_STEER_DISTANCE = 34;
const SPECIATION_INTERVAL_TICKS = 14;
const MIN_BRANCH_MEMBERS = 3;
const MIN_PARENT_MEMBERS = 7;
const ISOLATION_RADIUS = 145;
const PERSISTENCE_REQUIRED = 3;

const ROLE_META = {
  agent: { guild: 'grazer', temp: 0.58, moisture: 0.62, elevation: 0.42, drain: 0.020 },
  predator: { guild: 'predator', temp: 0.54, moisture: 0.52, elevation: 0.48, drain: 0.026 },
  apex: { guild: 'apex', temp: 0.49, moisture: 0.46, elevation: 0.54, drain: 0.022 },
};

const PREFIXES = ['River', 'Dune', 'Moss', 'Highland', 'Marsh', 'Cinder', 'Silver', 'Shadow', 'Sun', 'Frost', 'Delta', 'Steppe'];
const SUFFIXES = {
  agent: ['Grazer', 'Browser', 'Runner', 'Hopper'],
  predator: ['Stalker', 'Hunter', 'Fang', 'Prowler'],
  apex: ['Warden', 'Titan', 'Crown', 'Maw'],
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (v, max) => ((v % max) + max) % max;

function wrappedDelta(value, origin, size) {
  let d = value - origin;
  if (d > size * 0.5) d -= size;
  else if (d < -size * 0.5) d += size;
  return d;
}

function torusDistance(a, b, world) {
  const dx = wrappedDelta(a.x, b.x, world.width);
  const dy = wrappedDelta(a.y, b.y, world.height);
  return Math.hypot(dx, dy);
}

function hash32(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function hash01(text) {
  return hash32(text) / 4294967295;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForPlanet() {
  for (let i = 0; i < 360; i++) {
    const planet = window.realitySandboxPlanet;
    if (planet?.world?.ecs?.components) return planet;
    await wait(40);
  }
  return null;
}

function install(planet) {
  if (window.realitySandboxEvolutionaryEcologyV45?.installed) return;

  const { world } = planet;
  const { position, velocity, agent, predator, apex, resource } = world.ecs.components;
  const nicheCache = new Map();
  const species = new Map();
  const entitySpecies = new Map();
  const branchPersistence = new Map();
  const ancestry = [];
  let biologyTick = 0;
  let nextSpeciesOrdinal = 1;
  let lastTickAt = performance.now();

  const stats = {
    ticks: 0,
    organismsEvaluated: 0,
    habitatSamples: 0,
    nicheCacheHits: 0,
    nicheCacheMisses: 0,
    nicheCacheEvictions: 0,
    habitatSteeringEvents: 0,
    favorableEnergyEvents: 0,
    stressEnergyEvents: 0,
    reproductionBoostEvents: 0,
    speciesAssignments: 0,
    speciationChecks: 0,
    speciationCandidates: 0,
    speciations: 0,
    lineages: 0,
    meanHabitatFitness: 0,
    minHabitatFitness: 1,
    maxHabitatFitness: 0,
    meanGeneticDivergence: 0,
    meanNicheDivergence: 0,
    meanIsolation: 0,
    renderLoopProceduralSamples: 0,
  };

  function paused() {
    return Boolean(window.realitySandboxDebug?.isPaused?.());
  }

  function roleMap(role) {
    return role === 'agent' ? agent : role === 'predator' ? predator : apex;
  }

  function roleFor(id) {
    if (agent.has(id)) return 'agent';
    if (predator.has(id)) return 'predator';
    if (apex.has(id)) return 'apex';
    return null;
  }

  function nicheKey(x, y) {
    return `${Math.floor(wrap(x, world.width) / NICHE_CACHE_CELL)}:${Math.floor(clamp(y, 0, world.height) / NICHE_CACHE_CELL)}`;
  }

  function sampleNiche(x, y) {
    const sx = wrap(x, world.width);
    const sy = clamp(y, 0, world.height);
    const key = nicheKey(sx, sy);
    const cached = nicheCache.get(key);
    if (cached) {
      nicheCache.delete(key);
      nicheCache.set(key, cached);
      stats.nicheCacheHits++;
      return cached;
    }

    stats.nicheCacheMisses++;
    stats.habitatSamples++;
    const terrain = samplePlanet(sx, sy, world.width, world.height);
    const water = sampleHydrology(sx, sy, world.width, world.height);
    const waterAccess = clamp(
      (water?.river || 0) * 0.55 +
      (water?.lake || 0) * 0.35 +
      (water?.delta || 0) * 0.60 +
      (water?.flood || 0) * 0.10,
      0,
      1,
    );
    const niche = {
      land: Boolean(terrain?.land),
      biome: terrain?.biome || 'unknown',
      temperature: clamp(Number(terrain?.temperature) || 0, 0, 1),
      moisture: clamp((Number(terrain?.rainfall) || 0) * 0.78 + waterAccess * 0.22, 0, 1),
      elevation: clamp(Number(terrain?.elevation) || 0, 0, 1),
      waterAccess,
      river: clamp(Number(water?.river) || 0, 0, 1),
      lake: clamp(Number(water?.lake) || 0, 0, 1),
      delta: clamp(Number(water?.delta) || 0, 0, 1),
    };
    nicheCache.set(key, niche);
    while (nicheCache.size > NICHE_CACHE_LIMIT) {
      nicheCache.delete(nicheCache.keys().next().value);
      stats.nicheCacheEvictions++;
    }
    return niche;
  }

  function ensureAdaptiveTraits(id, organism, role) {
    const meta = ROLE_META[role];
    const dna = organism.dna || (organism.dna = { speed: 1, sense: 1, metabolism: 1, hueShift: 0 });
    const seed = `${role}:${id}:${dna.hueShift || 0}`;
    organism.preferredTemperature ??= clamp(meta.temp + (hash01(seed + ':t') - 0.5) * 0.18, 0.08, 0.92);
    organism.moisturePreference ??= clamp(meta.moisture + (hash01(seed + ':m') - 0.5) * 0.22, 0.05, 0.95);
    organism.elevationPreference ??= clamp(meta.elevation + (hash01(seed + ':e') - 0.5) * 0.22, 0.06, 0.94);
    organism.waterAffinity ??= clamp(0.24 + (hash01(seed + ':w') - 0.5) * 0.28, 0.02, 0.62);
    organism.habitatFitness ??= 0.55;
    organism.fertilityCredit ??= 0;
  }

  function localFoodScore(role, pos) {
    let total = 0;
    let count = 0;
    if (role === 'agent') {
      for (const [id, res] of resource.entries()) {
        if ((res.amount || 0) <= 0.05) continue;
        const p = position.get(id);
        if (!p) continue;
        const d = torusDistance(pos, p, world);
        if (d > 95) continue;
        total += (res.amount || 0) * (1 - d / 95);
        count++;
        if (count >= 18) break;
      }
      return clamp(total / 4.5, 0, 1);
    }

    const preyMap = role === 'predator' ? agent : predator;
    const radius = role === 'predator' ? 170 : 220;
    for (const [id] of preyMap.entries()) {
      const p = position.get(id);
      if (!p) continue;
      const d = torusDistance(pos, p, world);
      if (d > radius) continue;
      total += 1 - d / radius;
      count++;
      if (count >= 14) break;
    }
    return clamp(total / (role === 'predator' ? 2.4 : 1.7), 0, 1);
  }

  function habitatFitness(id, organism, role, pos, niche) {
    ensureAdaptiveTraits(id, organism, role);
    const temperatureFit = 1 - clamp(Math.abs(niche.temperature - organism.preferredTemperature) / 0.42, 0, 1);
    const moistureFit = 1 - clamp(Math.abs(niche.moisture - organism.moisturePreference) / 0.52, 0, 1);
    const elevationFit = 1 - clamp(Math.abs(niche.elevation - organism.elevationPreference) / 0.48, 0, 1);
    const waterFit = clamp(1 - Math.abs(niche.waterAccess - organism.waterAffinity) / 0.62, 0, 1);
    const foodFit = localFoodScore(role, pos);
    const landPenalty = !niche.land || niche.lake > 0.72 ? 0.08 : 1;
    const icePenalty = ['ice', 'snow-mountain'].includes(niche.biome) && organism.preferredTemperature > 0.34 ? 0.48 : 1;
    return clamp(
      (temperatureFit * 0.28 + moistureFit * 0.18 + elevationFit * 0.13 + waterFit * 0.11 + foodFit * 0.30) * landPenalty * icePenalty,
      0,
      1,
    );
  }

  function nicheFitnessAt(id, organism, role, x, y) {
    const pos = { x: wrap(x, world.width), y: clamp(y, 0, world.height) };
    return habitatFitness(id, organism, role, pos, sampleNiche(pos.x, pos.y));
  }

  function steerTowardBetterHabitat(id, organism, role, pos, vel, currentFitness) {
    const directions = [
      [HABITAT_STEER_DISTANCE, 0], [-HABITAT_STEER_DISTANCE, 0],
      [0, HABITAT_STEER_DISTANCE], [0, -HABITAT_STEER_DISTANCE],
    ];
    let best = currentFitness;
    let bestDx = 0;
    let bestDy = 0;
    for (const [dx, dy] of directions) {
      const score = nicheFitnessAt(id, organism, role, pos.x + dx, pos.y + dy);
      if (score > best + 0.055) {
        best = score;
        bestDx = dx;
        bestDy = dy;
      }
    }
    if (!bestDx && !bestDy) return;
    const strength = (best - currentFitness) * (role === 'agent' ? 8.5 : 6.2);
    vel.vx += Math.sign(bestDx) * strength;
    vel.vy += Math.sign(bestDy) * strength;
    stats.habitatSteeringEvents++;
  }

  function applySelection(dt) {
    let fitnessSum = 0;
    let evaluated = 0;
    let minFit = 1;
    let maxFit = 0;

    for (const role of ['agent', 'predator', 'apex']) {
      const map = roleMap(role);
      const meta = ROLE_META[role];
      for (const [id, organism] of map.entries()) {
        const pos = position.get(id);
        const vel = velocity.get(id);
        if (!pos || !vel) continue;
        const niche = sampleNiche(pos.x, pos.y);
        const rawFitness = habitatFitness(id, organism, role, pos, niche);
        organism.habitatFitness = clamp((organism.habitatFitness ?? rawFitness) * 0.72 + rawFitness * 0.28, 0, 1);
        organism.selectionPressure = 1 - organism.habitatFitness;
        organism.localNiche = {
          temperature: niche.temperature,
          moisture: niche.moisture,
          elevation: niche.elevation,
          waterAccess: niche.waterAccess,
          biome: niche.biome,
        };

        const fit = organism.habitatFitness;
        const dna = organism.dna || { metabolism: 1 };
        const metabolicCost = meta.drain * (dna.metabolism || 1);
        if ('energy' in organism) {
          if (fit < 0.46) {
            organism.energy = Math.max(0, organism.energy - (0.46 - fit) * metabolicCost * dt * 2.6);
            stats.stressEnergyEvents++;
          } else if (fit > 0.68) {
            organism.energy += (fit - 0.68) * metabolicCost * dt * 0.72;
            const maxEnergy = role === 'agent' ? 2.05 : role === 'predator' ? 3.55 : 5.0;
            organism.energy = Math.min(maxEnergy, organism.energy);
            stats.favorableEnergyEvents++;
          }
        }

        // Habitat fitness directly changes time-to-reproduction without inventing offspring.
        // Existing reproduction systems still decide when a real birth happens.
        organism.fertilityCredit = clamp((organism.fertilityCredit || 0) + (fit - 0.54) * dt * 0.055, -0.8, 1.4);
        if (organism.fertilityCredit > 0.48 && (organism.energy || 0) > 0.7) {
          organism.age = (organism.age || 0) + dt * clamp(organism.fertilityCredit, 0, 0.7) * 0.55;
          stats.reproductionBoostEvents++;
        }

        if (fit < 0.82) steerTowardBetterHabitat(id, organism, role, pos, vel, fit);
        fitnessSum += fit;
        evaluated++;
        minFit = Math.min(minFit, fit);
        maxFit = Math.max(maxFit, fit);
      }
    }

    stats.organismsEvaluated += evaluated;
    stats.meanHabitatFitness = evaluated ? fitnessSum / evaluated : 0;
    stats.minHabitatFitness = evaluated ? minFit : 0;
    stats.maxHabitatFitness = evaluated ? maxFit : 0;
  }

  function genomeVector(organism) {
    const dna = organism?.dna || {};
    return {
      speed: Number(dna.speed) || 1,
      sense: Number(dna.sense) || 1,
      metabolism: Number(dna.metabolism) || 1,
      temp: Number(organism?.preferredTemperature) || 0.55,
      moisture: Number(organism?.moisturePreference) || 0.55,
      elevation: Number(organism?.elevationPreference) || 0.45,
      water: Number(organism?.waterAffinity) || 0.25,
    };
  }

  function meanGenome(members) {
    const sum = { speed: 0, sense: 0, metabolism: 0, temp: 0, moisture: 0, elevation: 0, water: 0 };
    for (const member of members) {
      const v = genomeVector(member.organism);
      for (const key of Object.keys(sum)) sum[key] += v[key];
    }
    const n = Math.max(1, members.length);
    for (const key of Object.keys(sum)) sum[key] /= n;
    return sum;
  }

  function meanNiche(members) {
    const sum = { temperature: 0, moisture: 0, elevation: 0, waterAccess: 0 };
    for (const member of members) {
      const niche = member.organism.localNiche || sampleNiche(member.pos.x, member.pos.y);
      sum.temperature += Number(niche.temperature) || 0;
      sum.moisture += Number(niche.moisture) || 0;
      sum.elevation += Number(niche.elevation) || 0;
      sum.waterAccess += Number(niche.waterAccess) || 0;
    }
    const n = Math.max(1, members.length);
    for (const key of Object.keys(sum)) sum[key] /= n;
    return sum;
  }

  function geneticDistance(a, b) {
    return clamp((
      Math.abs(a.speed - b.speed) / 1.7 +
      Math.abs(a.sense - b.sense) / 1.8 +
      Math.abs(a.metabolism - b.metabolism) / 1.8 +
      Math.abs(a.temp - b.temp) / 0.9 +
      Math.abs(a.moisture - b.moisture) / 0.9 +
      Math.abs(a.elevation - b.elevation) / 0.9 +
      Math.abs(a.water - b.water) / 0.6
    ) / 7, 0, 1);
  }

  function nicheDistance(a, b) {
    return clamp((
      Math.abs(a.temperature - b.temperature) +
      Math.abs(a.moisture - b.moisture) +
      Math.abs(a.elevation - b.elevation) +
      Math.abs(a.waterAccess - b.waterAccess)
    ) / 4, 0, 1);
  }

  function circularMean(values, max) {
    if (!values.length) return 0;
    let sx = 0;
    let sy = 0;
    for (const value of values) {
      const a = wrap(value, max) / max * Math.PI * 2;
      sx += Math.cos(a);
      sy += Math.sin(a);
    }
    let angle = Math.atan2(sy, sx);
    if (angle < 0) angle += Math.PI * 2;
    return angle / (Math.PI * 2) * max;
  }

  function centroid(members) {
    return {
      x: circularMean(members.map(m => m.pos.x), world.width),
      y: members.reduce((sum, m) => sum + m.pos.y, 0) / Math.max(1, members.length),
    };
  }

  function ensureRootSpecies(role) {
    const existing = [...species.values()].find(s => s.role === role && s.parentId == null);
    if (existing) return existing;
    const id = `${ROLE_META[role].guild}-root`;
    const record = {
      id,
      name: role === 'agent' ? 'Azure Grazer' : role === 'predator' ? 'Ember Stalker' : 'Violet Apex',
      role,
      parentId: null,
      generation: 0,
      population: 0,
      foundedTick: 0,
      centroid: { x: world.width * 0.5, y: world.height * 0.5 },
      meanGenome: null,
      niche: null,
      extinct: false,
    };
    species.set(id, record);
    return record;
  }

  function assignUnclassified() {
    for (const role of ['agent', 'predator', 'apex']) ensureRootSpecies(role);
    const all = [];
    for (const role of ['agent', 'predator', 'apex']) {
      for (const [id, organism] of roleMap(role).entries()) {
        const pos = position.get(id);
        if (!pos) continue;
        all.push({ id, role, organism, pos });
      }
    }

    for (const member of all) {
      if (entitySpecies.has(member.id)) continue;
      let best = null;
      let bestD = Infinity;
      for (const other of all) {
        if (other.id === member.id || other.role !== member.role || !entitySpecies.has(other.id)) continue;
        const d = torusDistance(member.pos, other.pos, world);
        if (d < bestD) { bestD = d; best = other; }
      }
      const speciesId = best && bestD < 120 ? entitySpecies.get(best.id) : ensureRootSpecies(member.role).id;
      entitySpecies.set(member.id, speciesId);
      member.organism.v45SpeciesId = speciesId;
      stats.speciesAssignments++;
    }

    for (const id of [...entitySpecies.keys()]) {
      if (!position.has(id) || !roleFor(id)) entitySpecies.delete(id);
    }
  }

  function speciesMembers(speciesId) {
    const out = [];
    for (const [id, sid] of entitySpecies.entries()) {
      if (sid !== speciesId) continue;
      const role = roleFor(id);
      const organism = role ? roleMap(role).get(id) : null;
      const pos = position.get(id);
      if (role && organism && pos) out.push({ id, role, organism, pos });
    }
    return out;
  }

  function refreshSpecies() {
    for (const record of species.values()) {
      const members = speciesMembers(record.id);
      record.population = members.length;
      record.extinct = members.length === 0 && record.foundedTick < biologyTick - 20;
      if (!members.length) continue;
      record.centroid = centroid(members);
      record.meanGenome = meanGenome(members);
      record.niche = meanNiche(members);
    }
    stats.lineages = species.size;
  }

  function spatialComponents(members) {
    const remaining = new Set(members.map(m => m.id));
    const byId = new Map(members.map(m => [m.id, m]));
    const components = [];
    while (remaining.size) {
      const startId = remaining.values().next().value;
      remaining.delete(startId);
      const queue = [startId];
      const component = [];
      while (queue.length) {
        const id = queue.pop();
        const member = byId.get(id);
        if (!member) continue;
        component.push(member);
        for (const otherId of [...remaining]) {
          const other = byId.get(otherId);
          if (other && torusDistance(member.pos, other.pos, world) <= ISOLATION_RADIUS) {
            remaining.delete(otherId);
            queue.push(otherId);
          }
        }
      }
      components.push(component);
    }
    return components.sort((a, b) => b.length - a.length);
  }

  function speciesName(role, niche, ordinal) {
    let prefixIndex = ordinal % PREFIXES.length;
    if (niche.waterAccess > 0.48) prefixIndex = niche.moisture > 0.62 ? 0 : 10;
    else if (niche.moisture > 0.72) prefixIndex = 1 + 1;
    else if (niche.moisture < 0.27) prefixIndex = 1;
    else if (niche.elevation > 0.68) prefixIndex = 3;
    else if (niche.temperature < 0.28) prefixIndex = 9;
    else if (niche.temperature > 0.76) prefixIndex = 8;
    const suffixes = SUFFIXES[role];
    return `${PREFIXES[prefixIndex % PREFIXES.length]} ${suffixes[(ordinal * 3) % suffixes.length]}`;
  }

  function maybeSpeciate() {
    stats.speciationChecks++;
    refreshSpecies();
    let geneticTotal = 0;
    let nicheTotal = 0;
    let isolationTotal = 0;
    let comparisons = 0;

    for (const parent of [...species.values()]) {
      if (parent.extinct || parent.population < MIN_PARENT_MEMBERS || !parent.meanGenome || !parent.niche) continue;
      const members = speciesMembers(parent.id);
      const components = spatialComponents(members);
      if (components.length < 2) continue;
      const main = components[0];
      const mainCenter = centroid(main);

      for (const branch of components.slice(1)) {
        if (branch.length < MIN_BRANCH_MEMBERS) continue;
        const branchGenome = meanGenome(branch);
        const branchNiche = meanNiche(branch);
        const branchCenter = centroid(branch);
        const genetic = geneticDistance(branchGenome, parent.meanGenome);
        const niche = nicheDistance(branchNiche, parent.niche);
        const isolation = clamp(torusDistance(mainCenter, branchCenter, world) / 420, 0, 1);
        geneticTotal += genetic;
        nicheTotal += niche;
        isolationTotal += isolation;
        comparisons++;

        const selectionContrast = Math.abs(
          branch.reduce((sum, m) => sum + (m.organism.habitatFitness || 0), 0) / branch.length -
          main.reduce((sum, m) => sum + (m.organism.habitatFitness || 0), 0) / main.length
        );
        const divergenceScore = genetic * 1.55 + niche * 1.20 + isolation * 0.82 + selectionContrast * 0.42;
        if (genetic < 0.035 || niche < 0.055 || isolation < 0.24 || divergenceScore < 0.34) continue;
        stats.speciationCandidates++;

        const branchKey = `${parent.id}:${Math.round(branchCenter.x / 60)}:${Math.round(branchCenter.y / 60)}`;
        const persistence = (branchPersistence.get(branchKey) || 0) + 1;
        branchPersistence.set(branchKey, persistence);
        if (persistence < PERSISTENCE_REQUIRED) continue;

        const id = `${ROLE_META[parent.role].guild}-${nextSpeciesOrdinal++}`;
        const child = {
          id,
          name: speciesName(parent.role, branchNiche, nextSpeciesOrdinal),
          role: parent.role,
          parentId: parent.id,
          generation: parent.generation + 1,
          population: branch.length,
          foundedTick: biologyTick,
          centroid: branchCenter,
          meanGenome: branchGenome,
          niche: branchNiche,
          extinct: false,
          divergence: { genetic, niche, isolation, selectionContrast, score: divergenceScore },
        };
        species.set(id, child);
        for (const member of branch) {
          entitySpecies.set(member.id, id);
          member.organism.v45SpeciesId = id;
          member.organism.speciesId = id;
        }
        ancestry.push({ parentId: parent.id, childId: id, tick: world.tick, biologyTick, divergence: child.divergence });
        stats.speciations++;
        branchPersistence.delete(branchKey);
        window.dispatchEvent(new CustomEvent('biosphere-event', {
          detail: {
            title: 'New species',
            description: `${child.name} branched from ${parent.name} after persistent geographic isolation, genetic divergence, and adaptation to a different habitat.`,
          },
        }));
        window.dispatchEvent(new CustomEvent('reality-history', {
          detail: [{
            title: 'Speciation',
            description: `${child.name} emerged from ${parent.name}; genetic ${genetic.toFixed(2)}, niche ${niche.toFixed(2)}, isolation ${isolation.toFixed(2)}.`,
            tick: world.tick,
            date: new Date().toISOString(),
          }],
        }));
        break;
      }
    }

    stats.meanGeneticDivergence = comparisons ? geneticTotal / comparisons : 0;
    stats.meanNicheDivergence = comparisons ? nicheTotal / comparisons : 0;
    stats.meanIsolation = comparisons ? isolationTotal / comparisons : 0;
    refreshSpecies();
  }

  function tick() {
    const now = performance.now();
    const dt = clamp((now - lastTickAt) / 1000, 0.05, 1.5);
    lastTickAt = now;
    if (!paused()) {
      biologyTick++;
      assignUnclassified();
      applySelection(dt);
      if (biologyTick % SPECIATION_INTERVAL_TICKS === 0) maybeSpeciate();
      else refreshSpecies();
      stats.ticks++;
    }
    setTimeout(tick, TICK_MS);
  }

  const api = {
    installed: true,
    getStats: () => ({
      ...stats,
      activeOrganisms: agent.size + predator.size + apex.size,
      livingSpecies: [...species.values()].filter(s => s.population > 0).length,
      totalSpecies: species.size,
      ancestryEvents: ancestry.length,
      nicheCacheSize: nicheCache.size,
      habitatDrivenPopulations: true,
      directHabitatFitness: true,
      habitatAffectsEnergyCost: true,
      habitatAffectsReproductiveOpportunity: true,
      localHabitatSteering: true,
      realSelectionPressure: true,
      randomSpeciation: false,
      speciationRequiresGeneticDivergence: true,
      speciationRequiresNicheDivergence: true,
      speciationRequiresGeographicIsolation: true,
      speciationRequiresPersistence: true,
      persistentIsolationCycles: PERSISTENCE_REQUIRED,
      globalPopulationCap: false,
      globalDisplayCap: false,
      scheduledBiologyCadenceMs: TICK_MS,
      proceduralSamplingInRenderLoop: false,
    }),
    getSpecies: () => [...species.values()].map(s => ({ ...s, centroid: { ...s.centroid }, meanGenome: s.meanGenome ? { ...s.meanGenome } : null, niche: s.niche ? { ...s.niche } : null })),
    getAncestry: () => ancestry.slice(),
    getSpeciesForEntity: id => species.get(entitySpecies.get(id)) || null,
  };

  window.realitySandboxEvolutionaryEcologyV45 = api;
  document.documentElement.dataset.evolutionaryEcologyV45 = 'habitat-selection-isolation-speciation';
  const previous = window.realitySandboxPresentationDiagnostics;
  window.realitySandboxPresentationDiagnostics = () => ({
    ...(typeof previous === 'function' ? previous() : {}),
    evolutionaryEcologyV45: api.getStats(),
  });

  assignUnclassified();
  refreshSpecies();
  tick();
}

waitForPlanet().then(planet => {
  if (!planet) {
    document.documentElement.dataset.evolutionaryEcologyV45 = 'unavailable';
    return;
  }
  install(planet);
});
