import { mulberry32 } from '../core/rng.js';

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const saturate = (value, scale = 1) => clamp(value / Math.max(1e-12, value + scale));

export function createPrebioticEvolution({ kernel, environment = {}, seed = 1, options = {} } = {}) {
  if (!kernel) throw new Error('createPrebioticEvolution requires a chemistry kernel');
  const rng = mulberry32(seed >>> 0);
  const { size } = kernel.getGrid();
  const config = {
    alphabet: options.alphabet ?? 'ABCD',
    minLength: options.minLength ?? 7,
    maxLength: options.maxLength ?? 16,
    mutationRate: options.mutationRate ?? 0.018,
    compartmentNucleationRate: options.compartmentNucleationRate ?? 0.0008,
    deNovoPolymerRate: options.deNovoPolymerRate ?? 0.0012,
    freeTemplateRate: options.freeTemplateRate ?? 0.032,
    compartmentTemplateRate: options.compartmentTemplateRate ?? 0.085,
    freeHydrolysisRate: options.freeHydrolysisRate ?? 0.0025,
    captureRate: options.captureRate ?? 0.012,
    membraneGrowthRate: options.membraneGrowthRate ?? 0.018,
    membraneDecayRate: options.membraneDecayRate ?? 0.0045,
    divisionThreshold: options.divisionThreshold ?? 1.35,
    deathThreshold: options.deathThreshold ?? 0.12,
    // This limits explicit genotype *resolution*, not polymer population. Rare
    // variants are coarse-grained into a retained lineage with all material kept.
    maxExplicitVariants: options.maxExplicitVariants ?? 96,
  };

  const freePolymers = Array.from({ length: size }, () => new Map());
  const compartments = [];
  const fields = {
    compartments: new Float32Array(size),
    freePolymers: new Float32Array(size),
    polymers: new Float32Array(size),
    variants: new Float32Array(size),
    heredity: new Float32Array(size),
    replication: new Float32Array(size),
    selection: new Float32Array(size),
  };
  let nextCompartmentId = 1;
  let clock = 0;
  let metrics = emptyMetrics();
  const totals = { deNovoPolymerizations: 0, templatedBirths: 0, mutations: 0, divisions: 0, deaths: 0, hydrolyzed: 0, captures: 0 };
  const peaks = { compartments: 0, polymerPopulation: 0, freePolymerPopulation: 0, sequenceVariants: 0, generations: 0, cellGenerations: 0 };
  const ema = { heredity: 0, replication: 0, variation: 0, selection: 0, cellDivision: 0, metabolism: 0 };

  function env(name, index, fallback = 0) {
    const values = environment[name];
    return values && Number.isFinite(values[index]) ? values[index] : fallback;
  }

  function step(dt = 0.25) {
    const simDt = clamp(Number(dt) || 0, 0, 1);
    if (!simDt) return getMetrics();
    clock += simDt;
    const chemical = kernel.getFields();
    const stepStats = {
      templatedBirths: 0,
      mutations: 0,
      copySimilaritySum: 0,
      copyEvents: 0,
      divisions: 0,
      metabolismFlux: 0,
      deaths: 0,
      polymerBefore: totalPolymerPopulation(),
      genotypeRows: [],
    };

    evolveFreePolymers(simDt, chemical, stepStats);
    nucleateCompartments(simDt, chemical);
    for (let i = compartments.length - 1; i >= 0; i--) {
      const compartment = compartments[i];
      evolveCompartment(compartment, simDt, chemical, stepStats);
      if (compartment.dead) {
        releaseCompartmentPolymers(compartment);
        compartments.splice(i, 1);
        stepStats.deaths++;
        totals.deaths++;
      }
    }

    updateSignals(stepStats);
    refreshFields();
    recalculateMetrics(stepStats);
    return getMetrics();
  }

  function evolveFreePolymers(dt, chemical, stats) {
    for (let cell = 0; cell < size; cell++) {
      const energyFlux = chemical.energyFlux[cell] ?? 0;
      const wetDry = env('wetDry', cell, 0.1);
      const hydro = env('hydrothermal', cell, 0.1);
      const minerals = env('minerals', cell, 0.2);
      const surfaceDrive = clamp(wetDry * 0.48 + minerals * 0.34 + hydro * 0.18);
      const feedstock = feedstockAvailability(cell);
      const deNovoChance = config.deNovoPolymerRate * feedstock * energyFlux * surfaceDrive * dt;
      if (rng() < deNovoChance) createDeNovoFreePolymer(cell);

      const map = freePolymers[cell];
      if (map.size) {
        replicateVariantMap({ map, cell, dt, stats, rate: config.freeTemplateRate, contextEnergy: energyFlux, contextMultiplier: 0.25 + surfaceDrive * 0.75 });
        hydrolyzeFreePolymers(cell, dt);
        pruneVariantMap(map);
      }
    }
  }

  function nucleateCompartments(dt, chemical) {
    for (let cell = 0; cell < size; cell++) {
      const potential = chemical.compartmentPotential[cell] ?? 0;
      const water = env('water', cell, 0.5);
      if (potential < 0.002 || water < 0.08) continue;
      const chance = config.compartmentNucleationRate * potential * (0.35 + water * 0.65) * dt;
      if (rng() < chance) {
        const compartment = makeCompartment(cell);
        captureFreePolymers(compartment, 0.12 + potential * 0.28);
        compartments.push(compartment);
      }
    }
  }

  function makeCompartment(cell, generation = 0) {
    return {
      id: nextCompartmentId++,
      cell,
      generation,
      age: 0,
      membrane: 0.42 + rng() * 0.2,
      energy: 0.12 + rng() * 0.12,
      starvation: 0,
      variants: new Map(),
      dead: false,
    };
  }

  function evolveCompartment(compartment, dt, chemical, stats) {
    const cell = compartment.cell;
    compartment.age += dt;
    const organics = chemical.organics[cell] ?? 0;
    const amphiphiles = chemical.amphiphiles[cell] ?? 0;
    const energyFlux = chemical.energyFlux[cell] ?? 0;
    const maintenance = chemical.selfMaintenance[cell] ?? 0;

    const polymerPopulation = mapPopulation(compartment.variants);
    const catalytic = aggregateCatalysis(compartment.variants);
    const metabolismGain = (energyFlux * (0.07 + catalytic.metabolism * 0.18) + maintenance * 0.12) * dt;
    const metabolicCost = (0.018 + polymerPopulation * 0.00035 + compartment.membrane * 0.003) * dt;
    compartment.energy = clamp(compartment.energy + metabolismGain - metabolicCost, 0, 2.5);
    stats.metabolismFlux += energyFlux * catalytic.metabolism * 0.18 * dt;

    const membraneGrowth = amphiphiles * config.membraneGrowthRate * (0.5 + catalytic.membrane) * (0.45 + organics * 0.55) * dt;
    const membraneDecay = config.membraneDecayRate * (1 + Math.max(0, 0.3 - compartment.energy)) * dt;
    compartment.membrane = Math.max(0, compartment.membrane + membraneGrowth - membraneDecay);

    captureFreePolymers(compartment, config.captureRate * dt * (0.3 + amphiphiles * 0.7));
    replicateVariantMap({
      map: compartment.variants,
      cell,
      dt,
      stats,
      rate: config.compartmentTemplateRate,
      contextEnergy: compartment.energy,
      contextMultiplier: 0.45 + env('water', cell, 0.5) * 0.35 + energyFlux * 0.2,
      energySink: amount => { compartment.energy = Math.max(0, compartment.energy - amount); },
    });
    pruneVariantMap(compartment.variants);

    const updatedPopulation = mapPopulation(compartment.variants);
    if (compartment.membrane >= config.divisionThreshold && compartment.energy > 0.28 && updatedPopulation >= 2) divideCompartment(compartment, stats);

    if (compartment.energy < 0.025) compartment.starvation += dt;
    else compartment.starvation = Math.max(0, compartment.starvation - dt * 0.5);
    if (compartment.membrane < config.deathThreshold || compartment.starvation > 28) compartment.dead = true;
  }

  function createDeNovoFreePolymer(cell) {
    const length = config.minLength + Math.floor(rng() * (config.maxLength - config.minLength + 1));
    const transfer = kernel.withdraw(cell, feedstockRequest(length));
    if (transfer.scale < 0.55) {
      if (Object.keys(transfer.bundle).length) kernel.deposit(cell, transfer.bundle);
      return false;
    }
    addVariantToMap(freePolymers[cell], randomSequence(length), 1, transfer.bundle, 0);
    totals.deNovoPolymerizations++;
    return true;
  }

  function replicateVariantMap({ map, cell, dt, stats, rate, contextEnergy, contextMultiplier, energySink }) {
    if (!map.size || contextEnergy <= 0.015) return;
    const feedstock = feedstockAvailability(cell);
    if (feedstock <= 0.01) return;
    const sourceRows = [...map.values()];
    for (const variant of sourceRows) {
      const traits = sequenceTraits(variant.sequence);
      const context = feedstock * clamp(contextMultiplier) * (0.15 + clamp(contextEnergy, 0, 2) * 0.85);
      const expected = variant.count * rate * traits.copy * context * dt;
      let births = Math.floor(expected);
      if (rng() < expected - births) births++;
      if (!births) {
        stats.genotypeRows.push({ fitness: traits.copy * context, perCapitaBirths: 0, count: variant.count });
        continue;
      }
      const maxProcessed = Math.min(births, 128);
      let actualBirths = 0;
      for (let b = 0; b < maxProcessed; b++) {
        const transfer = kernel.withdraw(cell, feedstockRequest(variant.sequence.length));
        if (transfer.scale < 0.7) {
          if (Object.keys(transfer.bundle).length) kernel.deposit(cell, transfer.bundle);
          break;
        }
        const childSequence = mutateSequence(variant.sequence);
        addVariantToMap(map, childSequence, 1, transfer.bundle, variant.generation + 1);
        stats.templatedBirths++;
        totals.templatedBirths++;
        stats.copyEvents++;
        stats.copySimilaritySum += sequenceSimilarity(variant.sequence, childSequence);
        if (childSequence !== variant.sequence) { stats.mutations++; totals.mutations++; }
        actualBirths++;
        energySink?.(0.0025 * variant.sequence.length);
      }
      stats.genotypeRows.push({ fitness: traits.copy * context, perCapitaBirths: actualBirths / Math.max(1, variant.count), count: variant.count });
    }
  }

  function hydrolyzeFreePolymers(cell, dt) {
    const map = freePolymers[cell];
    const water = env('water', cell, 0.5);
    const uv = env('ultraviolet', cell, 0.1);
    const temperature = kernel.getFields().temperatureK[cell] ?? 285;
    const stress = clamp(water * 0.35 + uv * 0.35 + Math.max(0, temperature - 330) / 250 * 0.3);
    for (const [sequence, variant] of [...map]) {
      const traits = sequenceTraits(sequence);
      const expectedDeaths = variant.count * config.freeHydrolysisRate * stress * (1.15 - traits.stability * 0.55) * dt;
      let deaths = Math.floor(expectedDeaths);
      if (rng() < expectedDeaths - deaths) deaths++;
      deaths = Math.min(deaths, variant.count);
      if (!deaths) continue;
      const fraction = deaths / variant.count;
      const returned = scaleBundle(variant.material, fraction);
      subtractBundle(variant.material, returned);
      variant.count -= deaths;
      kernel.deposit(cell, returned);
      totals.hydrolyzed += deaths;
      if (variant.count <= 0) map.delete(sequence);
    }
  }

  function captureFreePolymers(compartment, probability) {
    const source = freePolymers[compartment.cell];
    const p = clamp(probability, 0, 0.75);
    if (!source.size || p <= 0) return;
    for (const [sequence, variant] of [...source]) {
      let captured = 0;
      for (let i = 0; i < variant.count; i++) if (rng() < p) captured++;
      if (!captured) continue;
      const fraction = captured / variant.count;
      const material = scaleBundle(variant.material, fraction);
      subtractBundle(variant.material, material);
      variant.count -= captured;
      addVariantToMap(compartment.variants, sequence, captured, material, variant.generation);
      totals.captures += captured;
      if (variant.count <= 0) source.delete(sequence);
    }
  }

  function feedstockRequest(length) {
    return {
      reducedCarbon: length * 0.000004,
      ammonia: length * 0.000002,
      phosphate: length * 0.00000018,
    };
  }

  function feedstockAvailability(cell) {
    const species = kernel.getSpecies();
    const reference = feedstockRequest((config.minLength + config.maxLength) * 0.5);
    return clamp(Math.min(
      species.reducedCarbon[cell] / Math.max(1e-12, reference.reducedCarbon * 4),
      species.ammonia[cell] / Math.max(1e-12, reference.ammonia * 4),
      species.phosphate[cell] / Math.max(1e-12, reference.phosphate * 4),
    ));
  }

  function addVariantToMap(map, sequence, count, material, generation) {
    let variant = map.get(sequence);
    if (!variant) {
      variant = { sequence, count: 0, generation: 0, material: {} };
      map.set(sequence, variant);
    }
    variant.count += count;
    variant.generation = Math.max(variant.generation, generation);
    mergeBundle(variant.material, material);
  }

  function divideCompartment(parent, stats) {
    const daughter = makeCompartment(parent.cell, parent.generation + 1);
    daughter.energy = parent.energy * 0.48;
    parent.energy *= 0.48;
    daughter.membrane = parent.membrane * 0.5;
    parent.membrane *= 0.5;
    for (const [sequence, variant] of [...parent.variants]) {
      let daughterCount = 0;
      for (let i = 0; i < variant.count; i++) if (rng() < 0.5) daughterCount++;
      if (variant.count > 1 && daughterCount === 0) daughterCount = 1;
      if (daughterCount <= 0) continue;
      const fraction = daughterCount / variant.count;
      const daughterMaterial = scaleBundle(variant.material, fraction);
      subtractBundle(variant.material, daughterMaterial);
      variant.count -= daughterCount;
      addVariantToMap(daughter.variants, sequence, daughterCount, daughterMaterial, variant.generation);
      if (variant.count <= 0) parent.variants.delete(sequence);
    }
    compartments.push(daughter);
    stats.divisions++;
    totals.divisions++;
  }

  function releaseCompartmentPolymers(compartment) {
    const target = freePolymers[compartment.cell];
    for (const variant of compartment.variants.values()) addVariantToMap(target, variant.sequence, variant.count, variant.material, variant.generation);
  }

  function pruneVariantMap(map) {
    if (map.size <= config.maxExplicitVariants) return;
    const ranked = [...map.values()].sort((a, b) => b.count - a.count);
    const keep = new Set(ranked.slice(0, config.maxExplicitVariants).map(v => v.sequence));
    const target = ranked[0];
    for (const [sequence, variant] of [...map]) {
      if (keep.has(sequence)) continue;
      target.count += variant.count;
      target.generation = Math.max(target.generation, variant.generation);
      mergeBundle(target.material, variant.material);
      map.delete(sequence);
    }
  }

  function updateSignals(stats) {
    const populationAfter = totalPolymerPopulation();
    const replicationSignal = saturate(stats.templatedBirths / Math.max(1, stats.polymerBefore), 0.03);
    const hereditySignal = stats.copyEvents ? stats.copySimilaritySum / stats.copyEvents : 0;
    const mutationFraction = stats.copyEvents ? stats.mutations / stats.copyEvents : 0;
    const diversitySignal = populationSequenceDiversity();
    const variationSignal = clamp(diversitySignal * 0.7 + saturate(mutationFraction, 0.04) * 0.3);
    const selectionSignal = positiveCorrelation(stats.genotypeRows);
    const divisionSignal = saturate(stats.divisions, 0.35);
    const metabolismSignal = saturate(stats.metabolismFlux / Math.max(1, compartments.length), 0.002);
    const alpha = 0.08;
    ema.replication = ema.replication * (1 - alpha) + replicationSignal * alpha;
    ema.heredity = ema.heredity * (1 - alpha) + hereditySignal * alpha;
    ema.variation = ema.variation * (1 - alpha) + variationSignal * alpha;
    ema.selection = ema.selection * (1 - alpha) + selectionSignal * alpha;
    ema.cellDivision = ema.cellDivision * (1 - alpha) + divisionSignal * alpha;
    ema.metabolism = ema.metabolism * (1 - alpha) + metabolismSignal * alpha;
    if (!populationAfter) {
      ema.replication *= 0.94;
      ema.heredity *= 0.94;
      ema.variation *= 0.94;
      ema.selection *= 0.94;
    }
  }

  function refreshFields() {
    for (const values of Object.values(fields)) values.fill(0);
    for (let cell = 0; cell < size; cell++) {
      const free = mapPopulation(freePolymers[cell]);
      fields.freePolymers[cell] = free;
      fields.polymers[cell] += free;
      fields.variants[cell] += freePolymers[cell].size;
    }
    for (const compartment of compartments) {
      const cell = compartment.cell;
      fields.compartments[cell] += 1;
      fields.polymers[cell] += mapPopulation(compartment.variants);
      fields.variants[cell] += compartment.variants.size;
    }
    if (totalPolymerPopulation()) {
      for (let cell = 0; cell < size; cell++) if (fields.polymers[cell] > 0) {
        fields.heredity[cell] = ema.heredity;
        fields.replication[cell] = ema.replication;
        fields.selection[cell] = ema.selection;
      }
    }
  }

  function recalculateMetrics(stats) {
    const polymerPopulation = totalPolymerPopulation();
    const freePolymerPopulation = totalFreePolymerPopulation();
    let maxGeneration = 0;
    let maxCellGeneration = 0;
    for (const map of freePolymers) for (const variant of map.values()) maxGeneration = Math.max(maxGeneration, variant.generation);
    for (const compartment of compartments) {
      maxCellGeneration = Math.max(maxCellGeneration, compartment.generation);
      for (const variant of compartment.variants.values()) maxGeneration = Math.max(maxGeneration, variant.generation);
    }
    const sequenceVariants = totalSequenceVariants();
    peaks.compartments = Math.max(peaks.compartments, compartments.length);
    peaks.polymerPopulation = Math.max(peaks.polymerPopulation, polymerPopulation);
    peaks.freePolymerPopulation = Math.max(peaks.freePolymerPopulation, freePolymerPopulation);
    peaks.sequenceVariants = Math.max(peaks.sequenceVariants, sequenceVariants);
    peaks.generations = Math.max(peaks.generations, maxGeneration);
    peaks.cellGenerations = Math.max(peaks.cellGenerations, maxCellGeneration);
    metrics = {
      clock,
      compartments: compartments.length,
      polymerPopulation,
      freePolymerPopulation,
      encapsulatedPolymerPopulation: Math.max(0, polymerPopulation - freePolymerPopulation),
      sequenceVariants,
      heredity: clamp(ema.heredity),
      replication: clamp(ema.replication),
      variation: clamp(ema.variation),
      selection: clamp(ema.selection),
      generations: maxGeneration,
      cellGenerations: maxCellGeneration,
      cellDivision: clamp(ema.cellDivision),
      metabolism: clamp(ema.metabolism),
      templatedBirths: stats.templatedBirths,
      mutations: stats.mutations,
      divisions: stats.divisions,
      deaths: stats.deaths,
      totalDeNovoPolymerizations: totals.deNovoPolymerizations,
      totalTemplatedBirths: totals.templatedBirths,
      totalMutations: totals.mutations,
      totalDivisions: totals.divisions,
      totalDeaths: totals.deaths,
      totalHydrolyzed: totals.hydrolyzed,
      totalCaptures: totals.captures,
      peakCompartments: peaks.compartments,
      peakPolymerPopulation: peaks.polymerPopulation,
      peakFreePolymerPopulation: peaks.freePolymerPopulation,
      peakSequenceVariants: peaks.sequenceVariants,
      peakGenerations: peaks.generations,
      peakCellGenerations: peaks.cellGenerations,
      maxElementDrift: kernel.getMetrics().maxElementDrift,
    };
  }

  function getMetrics() { return { ...metrics }; }

  function totalPolymerPopulation() {
    let total = totalFreePolymerPopulation();
    for (const compartment of compartments) total += mapPopulation(compartment.variants);
    return total;
  }

  function totalFreePolymerPopulation() {
    let total = 0;
    for (const map of freePolymers) total += mapPopulation(map);
    return total;
  }

  function mapPopulation(map) {
    let total = 0;
    for (const variant of map.values()) total += variant.count;
    return total;
  }

  function totalSequenceVariants() {
    const all = new Set();
    for (const map of freePolymers) for (const sequence of map.keys()) all.add(sequence);
    for (const compartment of compartments) for (const sequence of compartment.variants.keys()) all.add(sequence);
    return all.size;
  }

  function aggregateCatalysis(map) {
    let count = 0, metabolism = 0, membrane = 0;
    for (const variant of map.values()) {
      const traits = sequenceTraits(variant.sequence);
      count += variant.count;
      metabolism += traits.metabolism * variant.count;
      membrane += traits.membrane * variant.count;
    }
    if (!count) return { metabolism: 0, membrane: 0 };
    return { metabolism: metabolism / count, membrane: membrane / count };
  }

  function populationSequenceDiversity() {
    const counts = new Map();
    let total = 0;
    const ingest = map => {
      for (const variant of map.values()) {
        counts.set(variant.sequence, (counts.get(variant.sequence) ?? 0) + variant.count);
        total += variant.count;
      }
    };
    for (const map of freePolymers) ingest(map);
    for (const compartment of compartments) ingest(compartment.variants);
    if (total <= 1 || counts.size <= 1) return 0;
    let entropy = 0;
    for (const count of counts.values()) {
      const p = count / total;
      entropy -= p * Math.log(p);
    }
    return clamp(entropy / Math.log(Math.min(total, Math.max(2, counts.size))));
  }

  function positiveCorrelation(rows) {
    const usable = rows.filter(row => row.count > 0);
    if (usable.length < 2) return 0;
    let weight = 0, meanX = 0, meanY = 0;
    for (const row of usable) { weight += row.count; meanX += row.fitness * row.count; meanY += row.perCapitaBirths * row.count; }
    if (!weight) return 0;
    meanX /= weight; meanY /= weight;
    let covariance = 0, varianceX = 0, varianceY = 0;
    for (const row of usable) {
      const dx = row.fitness - meanX, dy = row.perCapitaBirths - meanY;
      covariance += row.count * dx * dy;
      varianceX += row.count * dx * dx;
      varianceY += row.count * dy * dy;
    }
    if (varianceX <= 1e-12 || varianceY <= 1e-12) return 0;
    return clamp(covariance / Math.sqrt(varianceX * varianceY), 0, 1);
  }

  function randomSequence(length) {
    let sequence = '';
    for (let i = 0; i < length; i++) sequence += config.alphabet[Math.floor(rng() * config.alphabet.length)];
    return sequence;
  }

  function mutateSequence(sequence) {
    const chars = [...sequence];
    let mutated = false;
    for (let i = 0; i < chars.length; i++) {
      if (rng() >= config.mutationRate) continue;
      const old = chars[i];
      let next = old;
      while (next === old) next = config.alphabet[Math.floor(rng() * config.alphabet.length)];
      chars[i] = next;
      mutated = true;
    }
    return mutated ? chars.join('') : sequence;
  }

  function sequenceTraits(sequence) {
    return {
      copy: 0.12 + hashedTrait(sequence, 0xA11CE) * 0.88,
      metabolism: hashedTrait(sequence, 0xB10C) ** 1.4,
      membrane: hashedTrait(sequence, 0xC311) ** 1.6,
      stability: 0.2 + hashedTrait(sequence, 0xD00D) * 0.8,
    };
  }

  function hashedTrait(sequence, salt) {
    let hash = (2166136261 ^ salt) >>> 0;
    for (let i = 0; i < sequence.length; i++) {
      hash ^= sequence.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967295;
  }

  function sequenceSimilarity(a, b) {
    const length = Math.max(a.length, b.length);
    if (!length) return 1;
    let same = 0;
    for (let i = 0; i < length; i++) if (a[i] === b[i]) same++;
    return same / length;
  }

  function mergeBundle(target, source = {}) {
    for (const [name, amount] of Object.entries(source)) target[name] = (target[name] ?? 0) + amount;
    return target;
  }

  function scaleBundle(bundle, fraction) {
    return Object.fromEntries(Object.entries(bundle).map(([name, amount]) => [name, amount * fraction]));
  }

  function subtractBundle(target, amount) {
    for (const [name, value] of Object.entries(amount)) target[name] = Math.max(0, (target[name] ?? 0) - value);
  }

  // Explicit diagnostic hooks used by tests and controlled experiments. Normal
  // runs never call these; they must nucleate polymers/compartments from chemistry.
  function debugSeedCompartment({ cell = 0, sequence = 'ABCDABCD', copies = 1, energy = 1.2, membrane = 1.1 } = {}) {
    const compartment = makeCompartment(clamp(Math.floor(cell), 0, size - 1));
    compartment.energy = energy;
    compartment.membrane = membrane;
    const transfer = kernel.withdraw(compartment.cell, feedstockRequest(sequence.length * copies));
    if (transfer.scale < 0.7) {
      if (Object.keys(transfer.bundle).length) kernel.deposit(compartment.cell, transfer.bundle);
      return null;
    }
    addVariantToMap(compartment.variants, sequence, copies, transfer.bundle, 0);
    compartments.push(compartment);
    refreshFields();
    return compartment.id;
  }

  function debugSeedFreePolymer({ cell = 0, sequence = 'ABCDABCD', copies = 1 } = {}) {
    const index = clamp(Math.floor(cell), 0, size - 1);
    const transfer = kernel.withdraw(index, feedstockRequest(sequence.length * copies));
    if (transfer.scale < 0.7) {
      if (Object.keys(transfer.bundle).length) kernel.deposit(index, transfer.bundle);
      return false;
    }
    addVariantToMap(freePolymers[index], sequence, copies, transfer.bundle, 0);
    refreshFields();
    return true;
  }

  return {
    step,
    getMetrics,
    getFields: () => fields,
    getCompartments: () => compartments.map(compartment => ({
      id: compartment.id,
      cell: compartment.cell,
      generation: compartment.generation,
      membrane: compartment.membrane,
      energy: compartment.energy,
      polymerPopulation: mapPopulation(compartment.variants),
      variants: [...compartment.variants.values()].map(v => ({ sequence: v.sequence, count: v.count, generation: v.generation })),
    })),
    getFreePolymers: cell => [...freePolymers[clamp(Math.floor(cell), 0, size - 1)].values()].map(v => ({ sequence: v.sequence, count: v.count, generation: v.generation })),
    debugSeedCompartment,
    debugSeedFreePolymer,
  };
}

function emptyMetrics() {
  return {
    clock: 0, compartments: 0, polymerPopulation: 0, freePolymerPopulation: 0, encapsulatedPolymerPopulation: 0,
    sequenceVariants: 0, heredity: 0, replication: 0, variation: 0, selection: 0, generations: 0,
    cellGenerations: 0, cellDivision: 0, metabolism: 0, templatedBirths: 0, mutations: 0, divisions: 0, deaths: 0,
    totalDeNovoPolymerizations: 0, totalTemplatedBirths: 0, totalMutations: 0, totalDivisions: 0, totalDeaths: 0,
    totalHydrolyzed: 0, totalCaptures: 0, peakCompartments: 0, peakPolymerPopulation: 0, peakFreePolymerPopulation: 0,
    peakSequenceVariants: 0, peakGenerations: 0, peakCellGenerations: 0, maxElementDrift: 0,
  };
}
