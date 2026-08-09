import { samplePlanet } from './planet.js';
import { sampleHydrology } from './hydrology.js';

const TICK_MS = 1200;
const TARGET_RECALC_TICKS = 4;
const MIGRATION_START_PRESSURE = 0.28;
const MIGRATION_STOP_PRESSURE = 0.16;
const TARGET_REACHED_DISTANCE = 62;
const CANDIDATE_RADII = [110, 210, 340];
const CANDIDATE_DIRECTIONS = 8;
const LOCAL_RADIUS = 110;
const REGION_COLS = 10;
const REGION_ROWS = 6;

const ROLE_SPEED = {
  agent: 15.5,
  predator: 13.0,
  apex: 10.0,
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
  return Math.hypot(
    wrappedDelta(a.x, b.x, world.width),
    wrappedDelta(a.y, b.y, world.height),
  );
}

function circularMean(values, max) {
  if (!values.length) return 0;
  let sx = 0;
  let sy = 0;
  for (const value of values) {
    const angle = wrap(value, max) / max * Math.PI * 2;
    sx += Math.cos(angle);
    sy += Math.sin(angle);
  }
  let angle = Math.atan2(sy, sx);
  if (angle < 0) angle += Math.PI * 2;
  return angle / (Math.PI * 2) * max;
}

async function waitForRuntime() {
  for (let i = 0; i < 420; i++) {
    const planet = window.realitySandboxPlanet;
    const evolution = window.realitySandboxEvolutionaryEcologyV45;
    if (planet?.world?.ecs?.components && evolution?.installed) return { planet, evolution };
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  return null;
}

function install({ planet, evolution }) {
  if (window.realitySandboxEcologicalMigrationV46?.installed) return;

  const { world, living } = planet;
  const { position, velocity, agent, predator, apex, resource } = world.ecs.components;
  const migration = new Map();
  const previousRegionalCounts = new Map();
  let ecologyTick = 0;
  let lastTickAt = performance.now();

  const stats = {
    ticks: 0,
    speciesEvaluated: 0,
    activeMigrations: 0,
    migrationsStarted: 0,
    migrationsCompleted: 0,
    migrationsAbandoned: 0,
    targetSearches: 0,
    candidateRegionsEvaluated: 0,
    migrationVelocityApplications: 0,
    herdCohesionApplications: 0,
    seasonalTriggers: 0,
    droughtTriggers: 0,
    floodTriggers: 0,
    scarcityTriggers: 0,
    crowdingTriggers: 0,
    redistributionEvents: 0,
    meanMigrationPressure: 0,
    maxMigrationPressure: 0,
    meanTargetImprovement: 0,
    renderLoopProceduralSamples: 0,
  };

  function paused() {
    return Boolean(window.realitySandboxDebug?.isPaused?.());
  }

  function roleFor(id) {
    if (agent.has(id)) return 'agent';
    if (predator.has(id)) return 'predator';
    if (apex.has(id)) return 'apex';
    return null;
  }

  function roleMap(role) {
    return role === 'agent' ? agent : role === 'predator' ? predator : apex;
  }

  function activeMembers() {
    const groups = new Map();
    for (const role of ['agent', 'predator', 'apex']) {
      for (const [id, organism] of roleMap(role).entries()) {
        const pos = position.get(id);
        const vel = velocity.get(id);
        if (!pos || !vel) continue;
        const speciesId = organism.v45SpeciesId || organism.speciesId || `${role}-unclassified`;
        if (!groups.has(speciesId)) groups.set(speciesId, []);
        groups.get(speciesId).push({ id, role, organism, pos, vel });
      }
    }
    return groups;
  }

  function centroid(members) {
    return {
      x: circularMean(members.map(member => member.pos.x), world.width),
      y: members.reduce((sum, member) => sum + member.pos.y, 0) / Math.max(1, members.length),
    };
  }

  function sampleNiche(x, y) {
    const sx = wrap(x, world.width);
    const sy = clamp(y, 0, world.height);
    const terrain = living?.sampleDynamicPlanet?.(sx, sy) || samplePlanet(sx, sy, world.width, world.height);
    const water = sampleHydrology(sx, sy, world.width, world.height);
    const waterAccess = clamp(
      (water?.river || 0) * 0.54 +
      (water?.lake || 0) * 0.35 +
      (water?.delta || 0) * 0.62 +
      (water?.flood || 0) * 0.10,
      0,
      1,
    );
    return {
      land: Boolean(terrain?.land),
      biome: terrain?.biome || 'unknown',
      temperature: clamp(Number(terrain?.temperature) || 0, 0, 1),
      moisture: clamp((Number(terrain?.rainfall) || 0) * 0.78 + waterAccess * 0.22, 0, 1),
      rainfall: clamp(Number(terrain?.rainfall) || 0, 0, 1),
      elevation: clamp(Number(terrain?.elevation) || 0, 0, 1),
      waterAccess,
      flood: clamp(Number(water?.flood) || 0, 0, 1),
      lake: clamp(Number(water?.lake) || 0, 0, 1),
    };
  }

  function nearbyFood(role, point, radius = LOCAL_RADIUS) {
    let score = 0;
    if (role === 'agent') {
      let seen = 0;
      for (const [id, res] of resource.entries()) {
        if ((res.amount || 0) <= 0.04) continue;
        const p = position.get(id);
        if (!p) continue;
        const d = torusDistance(point, p, world);
        if (d > radius) continue;
        score += (res.amount || 0) * (1 - d / radius);
        seen++;
        if (seen >= 24) break;
      }
      return clamp(score / 5.5, 0, 1);
    }

    const preyMap = role === 'predator' ? agent : predator;
    const preyRadius = role === 'predator' ? radius * 1.35 : radius * 1.65;
    let seen = 0;
    for (const [id] of preyMap.entries()) {
      const p = position.get(id);
      if (!p) continue;
      const d = torusDistance(point, p, world);
      if (d > preyRadius) continue;
      score += 1 - d / preyRadius;
      seen++;
      if (seen >= 18) break;
    }
    return clamp(score / (role === 'predator' ? 3.0 : 2.0), 0, 1);
  }

  function localCrowding(speciesId, point, groups) {
    const members = groups.get(speciesId) || [];
    let nearby = 0;
    for (const member of members) {
      if (torusDistance(point, member.pos, world) <= 95) nearby++;
    }
    return clamp((nearby - 4) / 10, 0, 1);
  }

  function representative(members) {
    const organism = members[0]?.organism || {};
    const count = Math.max(1, members.length);
    let preferredTemperature = 0;
    let moisturePreference = 0;
    let elevationPreference = 0;
    let waterAffinity = 0;
    let habitatFitness = 0;
    for (const member of members) {
      preferredTemperature += Number(member.organism.preferredTemperature) || 0.55;
      moisturePreference += Number(member.organism.moisturePreference) || 0.55;
      elevationPreference += Number(member.organism.elevationPreference) || 0.45;
      waterAffinity += Number(member.organism.waterAffinity) || 0.25;
      habitatFitness += Number(member.organism.habitatFitness) || 0.5;
    }
    return {
      role: members[0]?.role || 'agent',
      preferredTemperature: preferredTemperature / count,
      moisturePreference: moisturePreference / count,
      elevationPreference: elevationPreference / count,
      waterAffinity: waterAffinity / count,
      habitatFitness: habitatFitness / count,
      sociality: Number(organism.sociality) || 0.5,
    };
  }

  function destinationScore(speciesId, rep, point, groups) {
    const niche = sampleNiche(point.x, point.y);
    if (!niche.land || niche.lake > 0.76) return 0.01;
    const temperatureFit = 1 - clamp(Math.abs(niche.temperature - rep.preferredTemperature) / 0.42, 0, 1);
    const moistureFit = 1 - clamp(Math.abs(niche.moisture - rep.moisturePreference) / 0.52, 0, 1);
    const elevationFit = 1 - clamp(Math.abs(niche.elevation - rep.elevationPreference) / 0.50, 0, 1);
    const waterFit = 1 - clamp(Math.abs(niche.waterAccess - rep.waterAffinity) / 0.65, 0, 1);
    const foodFit = nearbyFood(rep.role, point, 125);
    const floodPenalty = clamp(niche.flood * 0.8 + Math.max(0, niche.lake - 0.48) * 1.4, 0, 1);
    const crowdPenalty = localCrowding(speciesId, point, groups);
    return clamp(
      temperatureFit * 0.23 +
      moistureFit * 0.15 +
      elevationFit * 0.10 +
      waterFit * 0.10 +
      foodFit * 0.32 +
      (1 - floodPenalty) * 0.06 +
      (1 - crowdPenalty) * 0.04,
      0,
      1,
    );
  }

  function pressureFor(speciesId, members, groups) {
    const center = centroid(members);
    const rep = representative(members);
    const niche = sampleNiche(center.x, center.y);
    const food = nearbyFood(rep.role, center, 125);
    const crowding = localCrowding(speciesId, center, groups);
    const temperatureMismatch = clamp(Math.abs(niche.temperature - rep.preferredTemperature) / 0.34, 0, 1);
    const drought = clamp((1 - niche.moisture) * (1 - niche.waterAccess * 0.7), 0, 1);
    const flood = clamp(niche.flood * 0.85 + Math.max(0, niche.lake - 0.45) * 1.5, 0, 1);
    const scarcity = clamp(1 - food, 0, 1);
    const selectionStress = clamp(1 - rep.habitatFitness, 0, 1);
    const values = {
      seasonal: temperatureMismatch,
      drought,
      flood,
      scarcity,
      crowding,
    };
    const pressure = clamp(
      temperatureMismatch * 0.22 +
      drought * 0.18 +
      flood * 0.17 +
      scarcity * 0.25 +
      crowding * 0.10 +
      selectionStress * 0.08,
      0,
      1,
    );
    const reason = Object.entries(values).sort((a, b) => b[1] - a[1])[0]?.[0] || 'scarcity';
    return { center, rep, niche, food, crowding, pressure, reason };
  }

  function findDestination(speciesId, assessment, groups) {
    stats.targetSearches++;
    const currentScore = destinationScore(speciesId, assessment.rep, assessment.center, groups);
    let bestPoint = assessment.center;
    let bestScore = currentScore;

    for (const radius of CANDIDATE_RADII) {
      for (let i = 0; i < CANDIDATE_DIRECTIONS; i++) {
        const angle = i / CANDIDATE_DIRECTIONS * Math.PI * 2;
        const point = {
          x: wrap(assessment.center.x + Math.cos(angle) * radius, world.width),
          y: clamp(assessment.center.y + Math.sin(angle) * radius, 0, world.height),
        };
        const score = destinationScore(speciesId, assessment.rep, point, groups);
        stats.candidateRegionsEvaluated++;
        if (score > bestScore) {
          bestScore = score;
          bestPoint = point;
        }
      }
    }

    return {
      target: bestPoint,
      currentScore,
      targetScore: bestScore,
      improvement: bestScore - currentScore,
    };
  }

  function noteTrigger(reason) {
    if (reason === 'seasonal') stats.seasonalTriggers++;
    else if (reason === 'drought') stats.droughtTriggers++;
    else if (reason === 'flood') stats.floodTriggers++;
    else if (reason === 'scarcity') stats.scarcityTriggers++;
    else if (reason === 'crowding') stats.crowdingTriggers++;
  }

  function startMigration(speciesId, assessment, destination) {
    const state = {
      speciesId,
      target: destination.target,
      reason: assessment.reason,
      pressure: assessment.pressure,
      startedTick: ecologyTick,
      targetScore: destination.targetScore,
      improvement: destination.improvement,
    };
    migration.set(speciesId, state);
    stats.migrationsStarted++;
    noteTrigger(assessment.reason);
    window.dispatchEvent(new CustomEvent('reality-history', {
      detail: [{
        title: 'Migration begins',
        description: `${speciesId} began a ${assessment.reason}-driven migration toward a region with ${(destination.improvement * 100).toFixed(0)}% better ecological suitability.`,
        tick: world.tick,
        date: new Date().toISOString(),
      }],
    }));
    return state;
  }

  function applyMigration(speciesId, members, assessment, state) {
    const center = centroid(members);
    const dx = wrappedDelta(state.target.x, center.x, world.width);
    const dy = wrappedDelta(state.target.y, center.y, world.height);
    const distance = Math.hypot(dx, dy);

    if (distance <= TARGET_REACHED_DISTANCE) {
      migration.delete(speciesId);
      stats.migrationsCompleted++;
      window.dispatchEvent(new CustomEvent('reality-history', {
        detail: [{
          title: 'Migration arrival',
          description: `${speciesId} reached its migration destination after ecological pressure shifted its range.`,
          tick: world.tick,
          date: new Date().toISOString(),
        }],
      }));
      return;
    }

    const pressure = clamp((assessment.pressure + state.pressure) * 0.5, 0, 1);
    const nx = dx / Math.max(1, distance);
    const ny = dy / Math.max(1, distance);
    const speed = ROLE_SPEED[assessment.rep.role] * (0.45 + pressure * 0.75);

    for (const member of members) {
      member.organism.migrationActive = true;
      member.organism.migrationReason = state.reason;
      member.organism.migrationTarget = { ...state.target };
      member.organism.migrationPressure = pressure;
      member.vel.vx += nx * speed;
      member.vel.vy += ny * speed;
      stats.migrationVelocityApplications++;

      const cx = wrappedDelta(center.x, member.pos.x, world.width);
      const cy = wrappedDelta(center.y, member.pos.y, world.height);
      const cd = Math.hypot(cx, cy);
      if (cd > 58) {
        const cohesion = clamp((cd - 58) / 120, 0, 1) * (1.4 + assessment.rep.sociality * 1.8);
        member.vel.vx += cx / Math.max(1, cd) * cohesion;
        member.vel.vy += cy / Math.max(1, cd) * cohesion;
        stats.herdCohesionApplications++;
      }
    }
  }

  function clearMigrationFlags(members) {
    for (const member of members) {
      member.organism.migrationActive = false;
      member.organism.migrationPressure = 0;
    }
  }

  function evaluateMigrations() {
    const groups = activeMembers();
    let pressureSum = 0;
    let pressureCount = 0;
    let maxPressure = 0;
    let improvementSum = 0;
    let improvementCount = 0;

    for (const [speciesId, members] of groups.entries()) {
      if (!members.length) continue;
      const assessment = pressureFor(speciesId, members, groups);
      pressureSum += assessment.pressure;
      pressureCount++;
      maxPressure = Math.max(maxPressure, assessment.pressure);
      stats.speciesEvaluated++;

      let state = migration.get(speciesId);
      if (state && assessment.pressure < MIGRATION_STOP_PRESSURE && ecologyTick - state.startedTick > 5) {
        migration.delete(speciesId);
        stats.migrationsAbandoned++;
        state = null;
      }

      if (!state && assessment.pressure >= MIGRATION_START_PRESSURE && ecologyTick % TARGET_RECALC_TICKS === 0) {
        const destination = findDestination(speciesId, assessment, groups);
        improvementSum += destination.improvement;
        improvementCount++;
        if (destination.improvement >= 0.065) state = startMigration(speciesId, assessment, destination);
      } else if (state && ecologyTick % TARGET_RECALC_TICKS === 0) {
        const destination = findDestination(speciesId, assessment, groups);
        improvementSum += destination.improvement;
        improvementCount++;
        if (destination.improvement > state.improvement + 0.05) {
          state.target = destination.target;
          state.targetScore = destination.targetScore;
          state.improvement = destination.improvement;
          state.pressure = assessment.pressure;
          state.reason = assessment.reason;
        }
      }

      if (state) applyMigration(speciesId, members, assessment, state);
      else clearMigrationFlags(members);
    }

    for (const speciesId of [...migration.keys()]) {
      if (!groups.has(speciesId)) migration.delete(speciesId);
    }

    stats.activeMigrations = migration.size;
    stats.meanMigrationPressure = pressureCount ? pressureSum / pressureCount : 0;
    stats.maxMigrationPressure = maxPressure;
    stats.meanTargetImprovement = improvementCount ? improvementSum / improvementCount : stats.meanTargetImprovement;
  }

  function regionalKey(speciesId, pos) {
    const cx = Math.floor(wrap(pos.x, world.width) / world.width * REGION_COLS);
    const cy = Math.floor(clamp(pos.y, 0, world.height - 0.0001) / world.height * REGION_ROWS);
    return `${speciesId}:${cx}:${cy}`;
  }

  function trackRedistribution() {
    const counts = new Map();
    const groups = activeMembers();
    for (const [speciesId, members] of groups.entries()) {
      for (const member of members) {
        const key = regionalKey(speciesId, member.pos);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }

    for (const [key, count] of counts.entries()) {
      const before = previousRegionalCounts.get(key) || 0;
      const delta = count - before;
      if (Math.abs(delta) >= 4 && count >= 4) {
        stats.redistributionEvents++;
        const speciesId = key.split(':')[0];
        const title = delta > 0 ? 'Population influx' : 'Population retreat';
        window.dispatchEvent(new CustomEvent('reality-history', {
          detail: [{
            title,
            description: `${speciesId} ${delta > 0 ? 'concentrated into' : 'withdrew from'} a regional habitat (${Math.abs(delta)} individuals changed the local population).`,
            tick: world.tick,
            date: new Date().toISOString(),
          }],
        }));
      }
    }
    previousRegionalCounts.clear();
    for (const [key, value] of counts.entries()) previousRegionalCounts.set(key, value);
  }

  function tick() {
    const now = performance.now();
    const dt = clamp((now - lastTickAt) / 1000, 0.1, 2.0);
    lastTickAt = now;
    if (!paused()) {
      ecologyTick++;
      evaluateMigrations(dt);
      if (ecologyTick % 6 === 0) trackRedistribution();
      stats.ticks++;
    }
    setTimeout(tick, TICK_MS);
  }

  const api = {
    installed: true,
    getStats: () => ({
      ...stats,
      activeMigrations: migration.size,
      migrationEnabled: true,
      speciesLevelMigration: true,
      seasonalTemperatureMigration: true,
      droughtMigration: true,
      floodMigration: true,
      foodScarcityMigration: true,
      crowdingMigration: true,
      herdCohesion: true,
      dynamicMigrationTargets: true,
      migrationTargetsRequireImprovement: true,
      habitatSelectionInheritedFromV45: Boolean(evolution?.getStats?.().habitatDrivenPopulations),
      globalPopulationCap: false,
      globalDisplayCap: false,
      scheduledEcologyCadenceMs: TICK_MS,
      proceduralSamplingInRenderLoop: false,
      renderLoopProceduralSamples: 0,
    }),
    getMigrations: () => [...migration.values()].map(state => ({ ...state, target: { ...state.target } })),
  };

  window.realitySandboxEcologicalMigrationV46 = api;
  document.documentElement.dataset.ecologicalMigrationV46 = 'seasonal-drought-flood-scarcity-herd-migration';
  const previous = window.realitySandboxPresentationDiagnostics;
  window.realitySandboxPresentationDiagnostics = () => ({
    ...(typeof previous === 'function' ? previous() : {}),
    ecologicalMigrationV46: api.getStats(),
  });

  tick();
}

waitForRuntime().then(state => {
  if (!state) {
    document.documentElement.dataset.ecologicalMigrationV46 = 'unavailable';
    return;
  }
  install(state);
});
