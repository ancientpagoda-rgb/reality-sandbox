const BIOLOGY_STEP = 0.9;
const RESOURCE_CELL = 72;
const MOTILE_CELL = 86;
const FOUNDER_FLORA = 6;
const PLANT_MUTATION_RATE = 0.012;
const MOTILE_MUTATION = 0.055;
const ORIGIN_MOTILITY = 0.22;
const ORIGIN_HETEROTROPHY = 0.20;
const ORIGIN_SENSE = 0.15;
const ORIGIN_BRAIN = 0.09;

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const wrap = (v, max) => ((v % max) + max) % max;

function hash32(text) {
  let h = 2166136261 >>> 0;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function hash01(text) {
  return hash32(text) / 4294967295;
}

function shortestDelta(value, origin, size) {
  let d = value - origin;
  if (d > size * 0.5) d -= size;
  else if (d < -size * 0.5) d += size;
  return d;
}

function distance(a, b, world) {
  return Math.hypot(shortestDelta(a.x, b.x, world.width), shortestDelta(a.y, b.y, world.height));
}

function cellKey(x, y, size, world) {
  return `${Math.floor(wrap(x, world.width) / size)}:${Math.floor(wrap(y, world.height) / size)}`;
}

function neighborKeys(x, y, size, world) {
  const cx = Math.floor(wrap(x, world.width) / size);
  const cy = Math.floor(wrap(y, world.height) / size);
  const nx = Math.max(1, Math.ceil(world.width / size));
  const ny = Math.max(1, Math.ceil(world.height / size));
  const out = [];
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      out.push(`${(cx + ox + nx) % nx}:${(cy + oy + ny) % ny}`);
    }
  }
  return out;
}

function copyGenome(g) {
  return {
    photosynthesis: g.photosynthesis,
    heterotrophy: g.heterotrophy,
    motility: g.motility,
    sense: g.sense,
    brainSpeed: g.brainSpeed,
    sociality: g.sociality,
    dormancy: g.dormancy,
    toxin: g.toxin,
    neurotoxin: g.neurotoxin,
    scavenging: g.scavenging,
    aggression: g.aggression,
    armor: g.armor,
    seedInvestment: g.seedInvestment,
    metabolism: g.metabolism,
    bodySize: g.bodySize,
  };
}

function genomeDistance(a, b) {
  const keys = ['photosynthesis', 'heterotrophy', 'motility', 'sense', 'brainSpeed', 'sociality', 'dormancy', 'toxin', 'neurotoxin', 'scavenging', 'aggression', 'armor', 'metabolism', 'bodySize'];
  let total = 0;
  for (const key of keys) total += Math.abs((a[key] || 0) - (b[key] || 0));
  return total / keys.length;
}

function formFor(g) {
  if (g.aggression > 0.62 && g.heterotrophy > 0.64) return 'predatory-motile';
  if (g.scavenging > 0.62 && g.heterotrophy > 0.48) return 'scavenger';
  if (g.heterotrophy > 0.56 && g.photosynthesis < 0.45) return 'heterotroph';
  if (g.heterotrophy > 0.28 && g.motility > 0.30) return 'mixotroph';
  return 'motile-photoautotroph';
}

function founderPlantGenome(seed, founder) {
  const r = suffix => hash01(`${seed}:flora:${founder}:${suffix}`);
  return {
    photosynthesis: 0.84 + r('photo') * 0.14,
    heterotrophy: 0.05 + r('hetero') * 0.12,
    motility: 0.02 + r('move') * 0.10,
    sense: 0.04 + r('sense') * 0.11,
    brainSpeed: 0.015 + r('brain') * 0.065,
    sociality: 0.12 + r('social') * 0.48,
    dormancy: 0.18 + r('sleep') * 0.58,
    toxin: r('toxin') * 0.18,
    neurotoxin: r('neuro') * 0.045,
    scavenging: 0.02 + r('scavenge') * 0.14,
    aggression: r('aggression') * 0.09,
    armor: 0.05 + r('armor') * 0.30,
    seedInvestment: 0.50 + r('seed') * 0.42,
    metabolism: 0.30 + r('metabolism') * 0.34,
    bodySize: 0.35 + r('size') * 0.42,
  };
}

function mutateGenome(parent, random, scale = MOTILE_MUTATION) {
  const g = copyGenome(parent);
  const vary = (key, amount = scale) => {
    g[key] = clamp(g[key] + (random() - 0.5) * amount * 2);
  };
  for (const key of Object.keys(g)) vary(key, key === 'bodySize' ? scale * 0.65 : scale);
  return g;
}

export function createOriginOfMotileLife(world, living, rng) {
  const random = typeof rng?.float === 'function' ? () => rng.float() : typeof rng === 'function' ? rng : Math.random;
  const seed = world.seed || 'nysa';
  const ecs = world.ecs;
  const { position, velocity, resource } = ecs.components;
  const motile = ecs.components.motile || (ecs.components.motile = new Map());
  const detritus = ecs.components.detritus || (ecs.components.detritus = new Map());

  const lineages = new Map();
  const ancestry = [];
  let accumulator = 0;
  let lineageOrdinal = 1;

  const stats = {
    ticks: 0,
    plantIndividuals: 0,
    plantLineages: 0,
    motilePopulation: 0,
    motileLineages: 0,
    originsFromPlants: 0,
    births: 0,
    deaths: 0,
    feedingEvents: 0,
    scavengingEvents: 0,
    predationEvents: 0,
    toxinEvents: 0,
    neurotoxinEvents: 0,
    flockingEvents: 0,
    sleepEvents: 0,
    photosyntheticEnergyEvents: 0,
    lineageBranches: 0,
    sleeping: 0,
    mixotrophs: 0,
    heterotrophs: 0,
    scavengers: 0,
    predatoryMotiles: 0,
    meanPhotosynthesis: 0,
    meanHeterotrophy: 0,
    meanMotility: 0,
    meanBrainSpeed: 0,
    hardPopulationCap: false,
    hardDisplayCap: false,
  };

  function emit(title, description) {
    window.dispatchEvent(new CustomEvent('biosphere-event', { detail: { title, description } }));
  }

  function ensureFounderLineage(founder) {
    const id = `flora-${founder + 1}`;
    if (!lineages.has(id)) {
      const genome = founderPlantGenome(seed, founder);
      lineages.set(id, {
        id,
        name: `Founder Flora ${founder + 1}`,
        type: 'photosynthetic',
        form: 'plant',
        parentId: null,
        generation: 0,
        population: 0,
        genome,
        motileOriginated: false,
      });
    }
    return lineages.get(id);
  }

  function buildGrid(component, cellSize) {
    const grid = new Map();
    for (const [id] of component.entries()) {
      const p = position.get(id);
      if (!p) continue;
      const key = cellKey(p.x, p.y, cellSize, world);
      let bucket = grid.get(key);
      if (!bucket) grid.set(key, bucket = []);
      bucket.push(id);
    }
    return grid;
  }

  function nearestClassifiedPlant(id, p, resourceGrid) {
    let best = null;
    let bestD = 95;
    for (const key of neighborKeys(p.x, p.y, RESOURCE_CELL, world)) {
      for (const otherId of resourceGrid.get(key) || []) {
        if (otherId === id) continue;
        const other = resource.get(otherId);
        const op = position.get(otherId);
        if (!other?.bioV47 || !op) continue;
        const d = distance(p, op, world);
        if (d < bestD) { bestD = d; best = other; }
      }
    }
    return best;
  }

  function ensurePlantBiology(resourceGrid) {
    for (const [id, res] of resource.entries()) {
      if (res.kind !== 'plant' && res.kind !== 'pod') continue;
      if (res.bioV47) continue;
      const p = position.get(id);
      if (!p) continue;
      const parent = nearestClassifiedPlant(id, p, resourceGrid);
      if (parent?.bioV47) {
        const parentLineage = lineages.get(parent.bioV47.lineageId);
        const genome = mutateGenome(parent.bioV47.genome, random, PLANT_MUTATION_RATE);
        res.bioV47 = {
          lineageId: parent.bioV47.lineageId,
          generation: (parent.bioV47.generation || 0) + 1,
          genome,
          motileCredit: 0,
        };
        if (parentLineage) parentLineage.genome = parentLineage.genome || copyGenome(genome);
      } else {
        const founder = Math.floor(hash01(`${seed}:plant:${id}`) * FOUNDER_FLORA) % FOUNDER_FLORA;
        const lineage = ensureFounderLineage(founder);
        res.bioV47 = {
          lineageId: lineage.id,
          generation: 0,
          genome: mutateGenome(lineage.genome, random, PLANT_MUTATION_RATE * 0.5),
          motileCredit: 0,
        };
      }
    }
  }

  function localPlantCompetition(id, p, resourceGrid) {
    let neighbors = 0;
    let food = 0;
    for (const key of neighborKeys(p.x, p.y, RESOURCE_CELL, world)) {
      for (const otherId of resourceGrid.get(key) || []) {
        if (otherId === id) continue;
        const other = resource.get(otherId);
        const op = position.get(otherId);
        if (!other || !op) continue;
        const d = distance(p, op, world);
        if (d > 70) continue;
        neighbors++;
        food += (other.amount || 0) * (1 - d / 70);
      }
    }
    return { competition: clamp(neighbors / 11), nearbyBiomass: clamp(food / 5) };
  }

  function evolvePlants(dt, resourceGrid) {
    for (const [id, res] of resource.entries()) {
      if (!res.bioV47 || (res.kind !== 'plant' && res.kind !== 'pod')) continue;
      const p = position.get(id);
      if (!p) continue;
      const g = res.bioV47.genome;
      const local = localPlantCompetition(id, p, resourceGrid);
      const climate = living?.sampleDynamicPlanet?.(p.x, p.y, 'origin-motile-v47') || {};
      const moisture = clamp(Number(climate.moisture ?? climate.rainfall ?? 0.5));
      const fertility = clamp(Number(climate.fertility ?? 0.55));
      const scarcity = clamp(1 - (res.amount || 0));
      const disturbance = clamp(Number(world.globals?.storminess) || 0);
      const competition = local.competition;
      const darknessOrCrowding = clamp(competition * 0.72 + (1 - fertility) * 0.28);

      const push = (key, pressure, rate) => {
        g[key] = clamp(g[key] + pressure * dt * rate);
      };

      push('heterotrophy', scarcity * 0.70 + competition * 0.40 + (1 - moisture) * 0.12 - g.photosynthesis * 0.08, 0.010);
      push('motility', darknessOrCrowding * 0.58 + scarcity * 0.42 + disturbance * 0.18 - g.seedInvestment * 0.08, 0.009);
      push('sense', g.motility * 0.42 + competition * 0.22 + scarcity * 0.20, 0.0065);
      push('brainSpeed', g.motility * g.sense * 0.46 + competition * 0.08, 0.0048);
      push('sociality', competition * 0.11 + disturbance * 0.08, 0.0025);
      push('dormancy', disturbance * 0.34 + (1 - moisture) * 0.13, 0.0035);
      push('toxin', competition * 0.29 + local.nearbyBiomass * 0.05, 0.0038);
      push('neurotoxin', g.toxin * g.heterotrophy * 0.14, 0.0018);
      push('scavenging', g.heterotrophy * scarcity * 0.28, 0.0042);
      push('aggression', g.heterotrophy * scarcity * 0.13 + competition * 0.05, 0.0026);
      push('armor', g.toxin * 0.035 + disturbance * 0.04, 0.0018);

      // Energy allocation trade-off: locomotion/feeding machinery slowly displaces pure photosynthesis.
      g.photosynthesis = clamp(g.photosynthesis - dt * 0.0025 * g.heterotrophy * g.motility, 0.05, 1);
      g.seedInvestment = clamp(g.seedInvestment - dt * 0.0018 * g.motility * g.brainSpeed, 0.02, 1);
      g.metabolism = clamp(g.metabolism + dt * 0.0020 * (g.brainSpeed + g.motility) - dt * 0.0005 * g.dormancy, 0.08, 1);

      const originScore = (g.motility - ORIGIN_MOTILITY) + (g.heterotrophy - ORIGIN_HETEROTROPHY) + (g.sense - ORIGIN_SENSE) + (g.brainSpeed - ORIGIN_BRAIN);
      if (originScore > 0) res.bioV47.motileCredit = (res.bioV47.motileCredit || 0) + originScore * dt * 0.18;

      const lineage = lineages.get(res.bioV47.lineageId);
      if (
        lineage && !lineage.motileOriginated &&
        g.motility >= ORIGIN_MOTILITY && g.heterotrophy >= ORIGIN_HETEROTROPHY &&
        g.sense >= ORIGIN_SENSE && g.brainSpeed >= ORIGIN_BRAIN &&
        res.bioV47.motileCredit >= 0.7
      ) {
        originateMotileFromPlant(id, res, lineage);
      }
    }
  }

  function makeLineage(parentLineage, genome, form, type = 'motile') {
    const id = `${type}-${lineageOrdinal++}`;
    const lineage = {
      id,
      name: type === 'motile' ? `Motile Lineage ${lineageOrdinal - 1}` : `Lineage ${lineageOrdinal - 1}`,
      type,
      form,
      parentId: parentLineage?.id || null,
      generation: (parentLineage?.generation || 0) + 1,
      population: 0,
      genome: copyGenome(genome),
      motileOriginated: type === 'motile',
    };
    lineages.set(id, lineage);
    ancestry.push({ parentId: lineage.parentId, childId: id, tick: world.tick, transition: form });
    stats.lineageBranches++;
    return lineage;
  }

  function originateMotileFromPlant(plantId, res, plantLineage) {
    const p = position.get(plantId);
    if (!p) return;
    plantLineage.motileOriginated = true;
    const genome = mutateGenome(res.bioV47.genome, random, 0.025);
    genome.motility = Math.max(genome.motility, ORIGIN_MOTILITY + 0.03);
    genome.heterotrophy = Math.max(genome.heterotrophy, ORIGIN_HETEROTROPHY + 0.03);
    genome.sense = Math.max(genome.sense, ORIGIN_SENSE + 0.02);
    genome.brainSpeed = Math.max(genome.brainSpeed, ORIGIN_BRAIN + 0.02);
    const lineage = makeLineage(plantLineage, genome, formFor(genome));
    const id = ecs.createEntity();
    position.set(id, { x: p.x, y: p.y });
    const angle = hash01(`${seed}:origin:${plantId}`) * Math.PI * 2;
    const speed = 3 + genome.motility * 15;
    velocity.set(id, { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
    motile.set(id, {
      lineageId: lineage.id,
      generation: 0,
      plantAncestorId: plantId,
      energy: 1.35,
      age: 0,
      state: 'awake',
      sleepDebt: 0.12,
      decisionCooldown: 0,
      neurotoxinLoad: 0,
      genome,
    });
    stats.originsFromPlants++;
    emit('Origin of motile life', `${plantLineage.name} produced a motile ${lineage.form} offshoot.`);
  }

  function nearestResource(p, radius, resourceGrid, preferDetritus = false) {
    let best = null;
    let bestD = radius;
    for (const key of neighborKeys(p.x, p.y, RESOURCE_CELL, world)) {
      for (const id of resourceGrid.get(key) || []) {
        const res = resource.get(id);
        const rp = position.get(id);
        if (!res || !rp || (res.amount || 0) <= 0.02) continue;
        const d = distance(p, rp, world);
        if (d < bestD) { bestD = d; best = { id, res, p: rp, d, kind: 'plant' }; }
      }
    }
    if (preferDetritus) {
      for (const [id, det] of detritus.entries()) {
        const dp = position.get(id);
        if (!dp || det.amount <= 0) continue;
        const d = distance(p, dp, world);
        if (d < bestD) { bestD = d; best = { id, res: det, p: dp, d, kind: 'detritus' }; }
      }
    }
    return best;
  }

  function nearbyMotiles(id, p, motileGrid, radius) {
    const out = [];
    for (const key of neighborKeys(p.x, p.y, MOTILE_CELL, world)) {
      for (const otherId of motileGrid.get(key) || []) {
        if (otherId === id) continue;
        const other = motile.get(otherId);
        const op = position.get(otherId);
        if (!other || !op) continue;
        const d = distance(p, op, world);
        if (d <= radius) out.push({ id: otherId, organism: other, p: op, d });
      }
    }
    return out;
  }

  function steer(vel, p, target, speed, blend) {
    const dx = shortestDelta(target.x, p.x, world.width);
    const dy = shortestDelta(target.y, p.y, world.height);
    const d = Math.hypot(dx, dy) || 1;
    vel.vx = vel.vx * blend + (dx / d) * speed * (1 - blend);
    vel.vy = vel.vy * blend + (dy / d) * speed * (1 - blend);
  }

  function createDetritus(p, amount, toxin = 0) {
    const id = ecs.createEntity();
    position.set(id, { x: p.x, y: p.y });
    detritus.set(id, { amount: clamp(amount, 0.05, 2), toxin: clamp(toxin), age: 0 });
  }

  function killMotile(id, reason = 'metabolic') {
    const organism = motile.get(id);
    const p = position.get(id);
    if (!organism || !p) return;
    createDetritus(p, 0.45 + organism.genome.bodySize * 0.8, organism.genome.toxin * 0.55);
    ecs.destroyEntity(id);
    stats.deaths++;
    if (reason === 'predation') stats.predationEvents++;
  }

  function maybeBranch(parent, childGenome) {
    const parentLineage = lineages.get(parent.lineageId);
    if (!parentLineage) return parent.lineageId;
    const form = formFor(childGenome);
    const distanceFromFounder = genomeDistance(childGenome, parentLineage.genome);
    if (form !== parentLineage.form || distanceFromFounder > 0.22) {
      const lineage = makeLineage(parentLineage, childGenome, form);
      emit('New motile lineage', `${lineage.name} diverged into a ${form}.`);
      return lineage.id;
    }
    return parent.lineageId;
  }

  function reproduceMotile(id, organism, p, vel) {
    if (organism.energy < 1.85 || organism.age < 10) return;
    const childGenome = mutateGenome(organism.genome, random, MOTILE_MUTATION);
    const childId = ecs.createEntity();
    const jitter = () => (random() - 0.5) * 7;
    position.set(childId, { x: wrap(p.x + jitter(), world.width), y: wrap(p.y + jitter(), world.height) });
    velocity.set(childId, { vx: (vel?.vx || 0) * 0.65 + jitter(), vy: (vel?.vy || 0) * 0.65 + jitter() });
    const lineageId = maybeBranch(organism, childGenome);
    motile.set(childId, {
      lineageId,
      generation: (organism.generation || 0) + 1,
      plantAncestorId: organism.plantAncestorId,
      energy: organism.energy * 0.44,
      age: 0,
      state: 'awake',
      sleepDebt: organism.sleepDebt * 0.35,
      decisionCooldown: 0,
      neurotoxinLoad: 0,
      genome: childGenome,
    });
    organism.energy *= 0.56;
    stats.births++;
  }

  function motileDecision(id, organism, p, vel, motileGrid, resourceGrid, dt) {
    const g = organism.genome;
    const senseRadius = 30 + g.sense * 165;
    const neighbors = nearbyMotiles(id, p, motileGrid, senseRadius);

    if (organism.sleepDebt > 0.78 + g.dormancy * 0.15 && organism.energy > 0.42) {
      organism.state = 'sleeping';
      organism.decisionCooldown = 0.8;
      stats.sleepEvents++;
      return;
    }

    // GooGrid-like flocking: inherited sociality changes whether relatives cohere.
    if (g.sociality > 0.38) {
      let cx = 0, cy = 0, count = 0;
      for (const n of neighbors) {
        if (n.organism.lineageId !== organism.lineageId) continue;
        cx += shortestDelta(n.p.x, p.x, world.width);
        cy += shortestDelta(n.p.y, p.y, world.height);
        count++;
      }
      if (count) {
        vel.vx += (cx / count) * g.sociality * 0.025 * dt;
        vel.vy += (cy / count) * g.sociality * 0.025 * dt;
        stats.flockingEvents++;
      }
    }

    let prey = null;
    if (g.aggression > 0.42 && g.heterotrophy > 0.48) {
      for (const n of neighbors) {
        if (n.organism.lineageId === organism.lineageId) continue;
        if (!prey || n.d < prey.d) prey = n;
      }
    }

    if (prey) {
      steer(vel, p, prey.p, 8 + g.motility * 34, clamp(0.80 - g.brainSpeed * 0.30, 0.38, 0.82));
      if (prey.d < 5 + g.bodySize * 4) {
        const defender = prey.organism.genome;
        const attack = g.aggression * 0.55 + g.neurotoxin * 0.55 + g.bodySize * 0.20 + g.brainSpeed * 0.12;
        const defense = defender.armor * 0.46 + defender.toxin * 0.32 + defender.bodySize * 0.24;
        if (defender.toxin > 0.15) {
          organism.energy = Math.max(0, organism.energy - defender.toxin * 0.16);
          stats.toxinEvents++;
        }
        if (g.neurotoxin > 0.10) {
          prey.organism.neurotoxinLoad = clamp((prey.organism.neurotoxinLoad || 0) + g.neurotoxin * 0.42, 0, 1.5);
          stats.neurotoxinEvents++;
        }
        if (attack > defense * 0.88) {
          organism.energy = Math.min(2.7, organism.energy + 0.55 + defender.bodySize * 0.42);
          killMotile(prey.id, 'predation');
        }
      }
      return;
    }

    const food = nearestResource(p, senseRadius, resourceGrid, g.scavenging > 0.24);
    if (food && g.heterotrophy > 0.12) {
      steer(vel, p, food.p, 6 + g.motility * 30, clamp(0.84 - g.brainSpeed * 0.34, 0.40, 0.86));
      if (food.d < 4 + g.bodySize * 3) {
        if (food.kind === 'detritus') {
          const bite = Math.min(food.res.amount, 0.18 + g.scavenging * 0.35);
          food.res.amount -= bite;
          organism.energy = Math.min(2.7, organism.energy + bite * (0.6 + g.scavenging));
          if (food.res.toxin > 0.08) organism.energy = Math.max(0, organism.energy - food.res.toxin * 0.12);
          stats.scavengingEvents++;
        } else {
          const bite = Math.min(food.res.amount || 0, 0.10 + g.heterotrophy * 0.22);
          food.res.amount = Math.max(0, (food.res.amount || 0) - bite);
          organism.energy = Math.min(2.7, organism.energy + bite * (0.7 + g.heterotrophy));
          stats.feedingEvents++;
        }
      }
      return;
    }

    // No target: low-cost exploratory drift. More advanced brains change direction more deliberately.
    const angle = random() * Math.PI * 2;
    const wander = 2 + g.motility * 11;
    vel.vx = vel.vx * 0.88 + Math.cos(angle) * wander * (0.12 + g.brainSpeed * 0.18);
    vel.vy = vel.vy * 0.88 + Math.sin(angle) * wander * (0.12 + g.brainSpeed * 0.18);
  }

  function evolveMotiles(dt, motileGrid, resourceGrid) {
    for (const [id, organism] of Array.from(motile.entries())) {
      const p = position.get(id);
      const vel = velocity.get(id);
      if (!p || !vel) continue;
      const g = organism.genome;
      organism.age += dt;
      organism.neurotoxinLoad = Math.max(0, (organism.neurotoxinLoad || 0) - dt * 0.06);

      if (organism.state === 'sleeping') {
        organism.sleepDebt = Math.max(0, organism.sleepDebt - dt * (0.11 + g.dormancy * 0.12));
        organism.energy = Math.min(2.7, organism.energy + dt * g.photosynthesis * 0.010);
        vel.vx *= Math.pow(0.22, dt);
        vel.vy *= Math.pow(0.22, dt);
        if (organism.sleepDebt < 0.20 || organism.energy < 0.25) organism.state = 'awake';
      } else {
        const neuralPenalty = clamp(1 - organism.neurotoxinLoad * 0.55, 0.25, 1);
        organism.sleepDebt = clamp(organism.sleepDebt + dt * (0.012 + g.brainSpeed * 0.025 + g.motility * 0.010), 0, 1.4);
        const motion = Math.hypot(vel.vx, vel.vy);
        const drain = (0.010 + g.metabolism * 0.018 + g.brainSpeed * 0.018 + g.motility * 0.013 + g.toxin * 0.006) * dt;
        organism.energy = Math.max(0, organism.energy - drain);
        if (motion < 16 && g.photosynthesis > 0.10) {
          organism.energy = Math.min(2.7, organism.energy + dt * g.photosynthesis * 0.012);
          stats.photosyntheticEnergyEvents++;
        }
        organism.decisionCooldown -= dt * neuralPenalty;
        if (organism.decisionCooldown <= 0) {
          motileDecision(id, organism, p, vel, motileGrid, resourceGrid, dt);
          organism.decisionCooldown = clamp(1.15 - g.brainSpeed * 0.92, 0.18, 1.15);
        }
      }

      if (organism.energy <= 0.015 || organism.age > 210 + g.dormancy * 190) {
        killMotile(id, 'metabolic');
        continue;
      }
      reproduceMotile(id, organism, p, vel);
    }
  }

  function decayDetritus(dt) {
    for (const [id, det] of Array.from(detritus.entries())) {
      det.age += dt;
      det.amount -= dt * (0.006 + det.age * 0.00002);
      if (det.amount <= 0) ecs.destroyEntity(id);
    }
  }

  function recount() {
    for (const lineage of lineages.values()) lineage.population = 0;
    let plantIndividuals = 0;
    for (const res of resource.values()) {
      if (!res.bioV47) continue;
      plantIndividuals++;
      const lineage = lineages.get(res.bioV47.lineageId);
      if (lineage) lineage.population++;
    }

    let sleeping = 0, mixotrophs = 0, heterotrophs = 0, scavengers = 0, predatory = 0;
    let photo = 0, hetero = 0, move = 0, brain = 0;
    for (const organism of motile.values()) {
      const lineage = lineages.get(organism.lineageId);
      if (lineage) lineage.population++;
      if (organism.state === 'sleeping') sleeping++;
      const form = formFor(organism.genome);
      if (form === 'mixotroph') mixotrophs++;
      else if (form === 'heterotroph') heterotrophs++;
      else if (form === 'scavenger') scavengers++;
      else if (form === 'predatory-motile') predatory++;
      photo += organism.genome.photosynthesis;
      hetero += organism.genome.heterotrophy;
      move += organism.genome.motility;
      brain += organism.genome.brainSpeed;
    }
    const count = motile.size || 1;
    stats.plantIndividuals = plantIndividuals;
    stats.plantLineages = [...lineages.values()].filter(x => x.type === 'photosynthetic').length;
    stats.motilePopulation = motile.size;
    stats.motileLineages = [...lineages.values()].filter(x => x.type === 'motile').length;
    stats.sleeping = sleeping;
    stats.mixotrophs = mixotrophs;
    stats.heterotrophs = heterotrophs;
    stats.scavengers = scavengers;
    stats.predatoryMotiles = predatory;
    stats.meanPhotosynthesis = motile.size ? photo / count : 0;
    stats.meanHeterotrophy = motile.size ? hetero / count : 0;
    stats.meanMotility = motile.size ? move / count : 0;
    stats.meanBrainSpeed = motile.size ? brain / count : 0;
  }

  function step(dt) {
    accumulator += dt;
    if (accumulator < BIOLOGY_STEP) return;
    const elapsed = accumulator;
    accumulator = 0;
    stats.ticks++;

    const resourceGrid = buildGrid(resource, RESOURCE_CELL);
    ensurePlantBiology(resourceGrid);
    evolvePlants(elapsed, resourceGrid);
    const motileGrid = buildGrid(motile, MOTILE_CELL);
    evolveMotiles(elapsed, motileGrid, resourceGrid);
    decayDetritus(elapsed);
    recount();
  }

  function getLineages() {
    return [...lineages.values()].map(lineage => ({ ...lineage, genome: copyGenome(lineage.genome) }));
  }

  function getMotiles() {
    return [...motile.entries()].map(([id, organism]) => ({ id, ...organism, position: position.get(id) ? { ...position.get(id) } : null, genome: copyGenome(organism.genome) }));
  }

  return {
    step,
    getStats: () => ({ ...stats, detritus: detritus.size, gooGridInspiredTraits: ['brainSpeed', 'sleepDebt', 'sociality', 'scavenging', 'toxin', 'neurotoxin', 'diet', 'energyBudget'], plantToAnimalContinuum: true }),
    getLineages,
    getAncestry: () => ancestry.slice(),
    getMotiles,
  };
}
