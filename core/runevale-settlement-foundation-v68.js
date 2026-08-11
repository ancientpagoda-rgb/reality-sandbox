const STEP_SECONDS = 0.25;
const SEA_LEVEL = 0.53;
const Z_SCALE = 62;
const EYE_HEIGHT = 3.6;
const FOV = Math.PI * 0.72;
const BUILD_DISTANCE = 10;
const HARVEST_RADIUS = 16;
const VERSION = 'v68a-runevale-settlement-foundation';

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number(v) || 0));
const wrap = (value, max) => ((value % max) + max) % max;
const copy = value => JSON.parse(JSON.stringify(value));

const BUILDINGS = Object.freeze({
  palisade:{ label:'Palisade', wood:8, stone:0, work:8, width:8, height:2.4, defense:3, housing:0, territory:1 },
  house:{ label:'House', wood:12, stone:2, work:12, width:5.5, height:4.2, defense:0, housing:4, territory:2 },
  tower:{ label:'Watch Tower', wood:8, stone:12, work:18, width:4.2, height:8.5, defense:8, housing:0, territory:4 },
  gatehouse:{ label:'Gatehouse', wood:12, stone:8, work:18, width:8.5, height:5.5, defense:6, housing:0, territory:3 },
  keep:{ label:'Stone Keep', wood:20, stone:28, work:34, width:9.5, height:10.5, defense:18, housing:8, territory:10 },
  farm:{ label:'Farm', wood:9, stone:1, work:10, width:9, height:2.2, defense:0, housing:0, territory:2 },
  well:{ label:'Well', wood:3, stone:7, work:8, width:2.5, height:1.4, defense:0, housing:0, territory:1 },
  workshop:{ label:'Workshop', wood:14, stone:5, work:16, width:6.5, height:4.8, defense:1, housing:1, territory:3 },
});

async function waitForRuntime() {
  while (true) {
    const planet = window.realitySandboxPlanet;
    const modules = window.realitySandboxModules;
    const surface = window.realitySandboxSurfaceMode;
    const c = planet?.world?.ecs?.components;
    if (planet?.living?.sampleDynamicPlanet && planet?.waterCycle?.sample && modules?.step && surface?.getPlayer && c?.resource instanceof Map && c?.position instanceof Map) {
      return { planet, modules, surface };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ planet, modules, surface }) {
  if (window.realitySandboxRunevaleSettlementV68?.installed) return;

  const { world, living, waterCycle } = planet;
  const { resource, position } = world.ecs.components;
  const numericSeed = Number(window.realitySandboxSeed?.numericSeed) || 734221;
  const persistenceKey = `realitySandbox:runevale-v68:${numericSeed}`;
  let accumulator = 0;
  let panelOpen = false;
  let selectedType = 'palisade';
  let overlayCanvas = null;
  let overlayCtx = null;
  let buildHud = null;
  let buildPanel = null;
  let lastUiRefresh = -Infinity;
  let lastRender = -Infinity;

  const stats = {
    steps:0,
    woodHarvestEvents:0,
    stoneHarvestEvents:0,
    ecologicalResourceDebited:0,
    stoneReserveDebited:0,
    settlementsFounded:0,
    blueprintsPlaced:0,
    materialHauls:0,
    constructionWorkTicks:0,
    structuresCompleted:0,
    structureRetrofitsStarted:0,
    structureRetrofitsCompleted:0,
    settlersBorn:0,
    foodProduced:0,
    waterProduced:0,
    defense:0,
    territoryRadius:0,
    renderedStructures:0,
    renderedWorkers:0,
  };

  function blankState() {
    return {
      schema:1,
      playerPack:{ wood:0, stone:0, food:0 },
      settlement:null,
      structures:[],
      workers:[],
      stoneCells:{},
      nextStructureId:1,
      nextWorkerId:1,
    };
  }

  function sanitizeState(input) {
    const next = blankState();
    if (!input || input.schema !== 1) return next;
    next.playerPack = {
      wood:Math.max(0, Number(input.playerPack?.wood) || 0),
      stone:Math.max(0, Number(input.playerPack?.stone) || 0),
      food:Math.max(0, Number(input.playerPack?.food) || 0),
    };
    next.settlement = input.settlement && Number.isFinite(input.settlement.x) && Number.isFinite(input.settlement.y) ? input.settlement : null;
    next.structures = Array.isArray(input.structures) ? input.structures.filter(item => item && BUILDINGS[item.type] && Number.isFinite(item.x) && Number.isFinite(item.y)) : [];
    next.workers = Array.isArray(input.workers) ? input.workers.filter(item => item && Number.isFinite(item.x) && Number.isFinite(item.y)) : [];
    next.stoneCells = input.stoneCells && typeof input.stoneCells === 'object' ? input.stoneCells : {};
    next.nextStructureId = Math.max(1, Number(input.nextStructureId) || 1);
    next.nextWorkerId = Math.max(1, Number(input.nextWorkerId) || 1);
    return next;
  }

  function loadState() {
    try {
      return sanitizeState(JSON.parse(localStorage.getItem(persistenceKey) || 'null'));
    } catch {
      return blankState();
    }
  }

  let state = loadState();

  function saveState() {
    try { localStorage.setItem(persistenceKey, JSON.stringify(state)); } catch {}
  }

  function terrainAt(x, y) {
    return living.sampleDynamicPlanet(wrap(x, world.width), clamp(y, 0, world.height));
  }

  function waterAt(x, y) {
    return waterCycle.sample(wrap(x, world.width), clamp(y, 0, world.height));
  }

  function groundZAt(x, y) {
    const terrain = terrainAt(x, y);
    return (terrain?.land ? terrain.elevation : SEA_LEVEL) * Z_SCALE;
  }

  function shortestWrappedDelta(value, origin, size) {
    let delta = value - origin;
    if (delta > size * 0.5) delta -= size;
    else if (delta < -size * 0.5) delta += size;
    return delta;
  }

  function distance(a, b) {
    const dx = shortestWrappedDelta(a.x, b.x, world.width);
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }

  function hash2(x, y, seed = numericSeed) {
    let h = (Math.imul(Math.floor(x), 374761393) ^ Math.imul(Math.floor(y), 668265263) ^ seed) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }

  function generatedSettlementName(x, y) {
    const first = ['Alder','Briar','Cinder','Dun','Ember','Falcon','Glen','Hearth','Iron','Juniper','Moor','Rowan','Stone','Thorn','Vale'];
    const second = ['brook','crest','ford','haven','hold','mark','mere','reach','rest','ridge','spire','stead','watch','wick','wood'];
    const a = Math.floor(hash2(x * 0.37, y * 0.61) * first.length) % first.length;
    const b = Math.floor(hash2(x * 0.83 + 7, y * 0.29 - 11) * second.length) % second.length;
    return `${first[a]}${second[b]}`;
  }

  function generatedHouseName(x, y) {
    const first = ['Ash','Briar','Cinder','Ember','Flint','Harrow','Iron','Morrow','Oak','Rowan','Stone','Thorn','Vale'];
    const second = ['briar','crest','hart','mark','mere','moor','rest','ridge','ward','watch','well','wyck'];
    const a = Math.floor(hash2(x * 0.51 + 19, y * 0.77) * first.length) % first.length;
    const b = Math.floor(hash2(x * 0.23 - 31, y * 0.43 + 13) * second.length) % second.length;
    return `House ${first[a]}${second[b]}`;
  }

  function storage() {
    return state.settlement?.stockpile || state.playerPack;
  }

  function addMaterials(kind, amount) {
    const target = storage();
    target[kind] = Math.max(0, (Number(target[kind]) || 0) + amount);
  }

  function nearestEcologicalResource(x, y) {
    let best = null;
    for (const [id, item] of resource.entries()) {
      const amount = Number(item?.amount) || 0;
      if (amount <= 0.015) continue;
      const p = position.get(id);
      if (!p) continue;
      const d = distance({ x, y }, p);
      if (d > HARVEST_RADIUS) continue;
      if (!best || d < best.distance) best = { id, item, position:p, distance:d };
    }
    return best;
  }

  function gatherWood() {
    const player = surface.getPlayer();
    const terrain = terrainAt(player.x, player.y);
    if (!terrain?.land) return { ok:false, reason:'Wood gathering requires land.' };
    const candidate = nearestEcologicalResource(player.x, player.y);
    if (!candidate) return { ok:false, reason:'No harvestable vegetation patch is close enough.' };
    const biomass = clamp(window.realitySandboxVegetationPresentation?.sampleBiomass?.(player.x, player.y) ?? candidate.item.amount ?? 0.3);
    const debit = Math.min(Number(candidate.item.amount) || 0, 0.06 + biomass * 0.08);
    if (debit <= 0.005) return { ok:false, reason:'This vegetation patch is exhausted.' };
    candidate.item.amount = Math.max(0, (Number(candidate.item.amount) || 0) - debit);
    const wood = Math.max(1, Math.round(debit * 64));
    addMaterials('wood', wood);
    stats.woodHarvestEvents++;
    stats.ecologicalResourceDebited += debit;
    window.realitySandboxVegetationPresentation?.rebuild?.();
    saveState();
    refreshUi(true);
    return { ok:true, wood, ecologicalDebit:debit, resourceId:candidate.id };
  }

  function stoneCellFor(x, y) {
    const cellX = Math.floor(wrap(x, world.width) / 12);
    const cellY = Math.floor(clamp(y, 0, world.height) / 12);
    const key = `${cellX}:${cellY}`;
    if (!state.stoneCells[key]) {
      const terrain = terrainAt(x, y);
      const relief = clamp(((terrain?.elevation ?? SEA_LEVEL) - SEA_LEVEL) * 2.8 + 0.35, 0.15, 1);
      const initial = Math.max(8, Math.round(12 + relief * 32 + hash2(cellX, cellY) * 24));
      state.stoneCells[key] = { initial, remaining:initial, cellX, cellY };
    }
    return state.stoneCells[key];
  }

  function gatherStone() {
    const player = surface.getPlayer();
    const terrain = terrainAt(player.x, player.y);
    if (!terrain?.land) return { ok:false, reason:'Stone quarrying requires exposed land.' };
    const cell = stoneCellFor(player.x, player.y);
    if (cell.remaining <= 0) return { ok:false, reason:'The nearby surface stone reserve is exhausted.' };
    const yieldAmount = Math.min(cell.remaining, Math.max(2, Math.round(2 + clamp(terrain.elevation) * 4)));
    cell.remaining -= yieldAmount;
    addMaterials('stone', yieldAmount);
    stats.stoneHarvestEvents++;
    stats.stoneReserveDebited += yieldAmount;
    saveState();
    refreshUi(true);
    return { ok:true, stone:yieldAmount, reserveRemaining:cell.remaining };
  }

  function spawnWorker(x, y) {
    const id = state.nextWorkerId++;
    state.workers.push({
      id,
      x:wrap(x + (hash2(id, 17) - 0.5) * 3, world.width),
      y:clamp(y + (hash2(id, 29) - 0.5) * 3, 0.05, world.height - 0.05),
      state:'idle',
      targetStructureId:null,
      cargo:{ wood:0, stone:0 },
    });
    return id;
  }

  function foundSettlement(name) {
    if (state.settlement) return { ok:false, reason:'A settlement is already founded in this world seed.' };
    const player = surface.getPlayer();
    const terrain = terrainAt(player.x, player.y);
    const water = waterAt(player.x, player.y);
    if (!terrain?.land || (water?.lake || 0) > 0.55) return { ok:false, reason:'Found the settlement on stable dry land.' };
    const settlementName = String(name || generatedSettlementName(player.x, player.y)).trim().slice(0, 40) || generatedSettlementName(player.x, player.y);
    state.settlement = {
      id:`settlement-${numericSeed}-${Math.round(player.x)}-${Math.round(player.y)}`,
      name:settlementName,
      houseName:generatedHouseName(player.x, player.y),
      x:player.x,
      y:player.y,
      foundedAtStep:stats.steps,
      population:2,
      housing:2,
      stockpile:{
        wood:state.playerPack.wood,
        stone:state.playerPack.stone,
        food:state.playerPack.food,
        water:4,
      },
      defense:0,
      territoryRadius:24,
      completedStructures:0,
    };
    state.playerPack = { wood:0, stone:0, food:0 };
    spawnWorker(player.x, player.y);
    spawnWorker(player.x, player.y);
    stats.settlementsFounded++;
    saveState();
    refreshUi(true);
    return { ok:true, settlement:copy(state.settlement) };
  }

  function candidatePlacement(type, distanceAhead = BUILD_DISTANCE) {
    const spec = BUILDINGS[type];
    if (!spec) return null;
    const player = surface.getPlayer();
    return {
      type,
      x:wrap(player.x + Math.cos(player.yaw) * distanceAhead, world.width),
      y:clamp(player.y + Math.sin(player.yaw) * distanceAhead, 0.05, world.height - 0.05),
      rotation:player.yaw,
    };
  }

  function placementIsClear(candidate) {
    const spec = BUILDINGS[candidate.type];
    const terrain = terrainAt(candidate.x, candidate.y);
    const water = waterAt(candidate.x, candidate.y);
    if (!terrain?.land || (water?.lake || 0) > 0.45) return { ok:false, reason:'Blueprint must sit on stable dry land.' };
    if (state.settlement && distance(candidate, state.settlement) > state.settlement.territoryRadius + 46) return { ok:false, reason:'This blueprint is too far from the settlement logistics radius.' };
    for (const structure of state.structures) {
      const other = BUILDINGS[structure.type];
      const minSpacing = Math.max(2.4, (spec.width + other.width) * 0.33);
      if (distance(candidate, structure) < minSpacing) return { ok:false, reason:'Another structure occupies that ground.' };
    }
    return { ok:true };
  }

  function placeBlueprint(type = selectedType, distanceAhead = BUILD_DISTANCE) {
    if (!state.settlement) return { ok:false, reason:'Found a settlement before placing buildings.' };
    const candidate = candidatePlacement(type, distanceAhead);
    if (!candidate) return { ok:false, reason:'Unknown building type.' };
    const clear = placementIsClear(candidate);
    if (!clear.ok) return clear;
    const spec = BUILDINGS[type];
    const structure = {
      id:state.nextStructureId++,
      type,
      x:candidate.x,
      y:candidate.y,
      rotation:candidate.rotation,
      status:'blueprint',
      required:{ wood:spec.wood, stone:spec.stone },
      delivered:{ wood:0, stone:0 },
      workRequired:spec.work,
      workDone:0,
      progress:0,
      placedAtStep:stats.steps,
      completedAtStep:null,
    };
    state.structures.push(structure);
    stats.blueprintsPlaced++;
    saveState();
    refreshUi(true);
    return { ok:true, structure:copy(structure) };
  }

  function structureNeedsMaterials(structure) {
    return Math.max(0, structure.required.wood - structure.delivered.wood) + Math.max(0, structure.required.stone - structure.delivered.stone) > 0;
  }

  function incompleteStructures() {
    return state.structures.filter(item => item.status !== 'complete');
  }

  function nearestIncomplete(worker) {
    let best = null;
    for (const structure of incompleteStructures()) {
      const d = distance(worker, structure);
      if (!best || d < best.distance || (d === best.distance && structure.id < best.structure.id)) best = { structure, distance:d };
    }
    return best?.structure || null;
  }

  function moveToward(worker, target, speed, dt) {
    const dx = shortestWrappedDelta(target.x, worker.x, world.width);
    const dy = target.y - worker.y;
    const d = Math.hypot(dx, dy);
    if (d <= speed * dt || d < 0.2) {
      worker.x = wrap(target.x, world.width);
      worker.y = clamp(target.y, 0.05, world.height - 0.05);
      return true;
    }
    worker.x = wrap(worker.x + dx / d * speed * dt, world.width);
    worker.y = clamp(worker.y + dy / d * speed * dt, 0.05, world.height - 0.05);
    return false;
  }

  function loadCargo(worker, structure) {
    const stockpile = state.settlement.stockpile;
    const needWood = Math.max(0, structure.required.wood - structure.delivered.wood);
    const needStone = Math.max(0, structure.required.stone - structure.delivered.stone);
    const wood = Math.min(4, needWood, stockpile.wood);
    const stone = Math.min(3, needStone, stockpile.stone);
    if (wood <= 0 && stone <= 0) return false;
    stockpile.wood -= wood;
    stockpile.stone -= stone;
    worker.cargo.wood = wood;
    worker.cargo.stone = stone;
    worker.state = 'hauling';
    stats.materialHauls++;
    return true;
  }

  function unloadCargo(worker, structure) {
    structure.delivered.wood += worker.cargo.wood;
    structure.delivered.stone += worker.cargo.stone;
    worker.cargo = { wood:0, stone:0 };
    structure.status = structureNeedsMaterials(structure) ? 'blueprint' : 'construction';
    worker.state = structure.status === 'construction' ? 'building' : 'fetching';
  }

  function completedCount(type) {
    return state.structures.filter(item => item.status === 'complete' && (!type || item.type === type)).length;
  }

  function constructionMultiplier() {
    return 1 + completedCount('workshop') * 0.14;
  }

  function recomputeSettlement() {
    const settlement = state.settlement;
    if (!settlement) return;
    let defense = 0;
    let housing = 2;
    let territory = 24;
    let complete = 0;
    for (const structure of state.structures) {
      if (structure.status !== 'complete') continue;
      const spec = BUILDINGS[structure.type];
      defense += spec.defense;
      housing += spec.housing;
      territory += spec.territory;
      complete++;
    }
    settlement.defense = defense;
    settlement.housing = housing;
    settlement.territoryRadius = territory;
    settlement.completedStructures = complete;
    stats.defense = defense;
    stats.territoryRadius = territory;
  }

  function completeStructure(structure) {
    if (structure.status === 'complete') return;
    structure.status = 'complete';
    structure.progress = 1;
    structure.completedAtStep = stats.steps;
    stats.structuresCompleted++;
    if (structure.retrofit && !structure.retrofit.completedAtStep) {
      structure.retrofit.completedAtStep = stats.steps;
      structure.retrofit.completed = true;
      stats.structureRetrofitsCompleted++;
    }
    recomputeSettlement();
  }

  function productionStep(dt) {
    if (!state.settlement) return;
    const farmCount = completedCount('farm');
    const wellCount = completedCount('well');
    if (farmCount) {
      const food = farmCount * 0.12 * dt;
      state.settlement.stockpile.food += food;
      stats.foodProduced += food;
    }
    if (wellCount) {
      const water = wellCount * 0.18 * dt;
      state.settlement.stockpile.water += water;
      stats.waterProduced += water;
    }

    const population = state.settlement.population;
    state.settlement.stockpile.food = Math.max(0, state.settlement.stockpile.food - population * 0.006 * dt);
    state.settlement.stockpile.water = Math.max(0, state.settlement.stockpile.water - population * 0.008 * dt);

    const supported = state.settlement.stockpile.food > population * 0.8 && state.settlement.stockpile.water > population * 1.0;
    if (supported && population < state.settlement.housing) {
      state.settlement.growthProgress = (Number(state.settlement.growthProgress) || 0) + dt * 0.035;
      if (state.settlement.growthProgress >= 1) {
        state.settlement.growthProgress -= 1;
        state.settlement.population++;
        spawnWorker(state.settlement.x, state.settlement.y);
        stats.settlersBorn++;
      }
    } else {
      state.settlement.growthProgress = Math.max(0, (Number(state.settlement.growthProgress) || 0) - dt * 0.01);
    }
  }

  function workerStep(worker, dt) {
    const settlement = state.settlement;
    if (!settlement) return;
    let target = state.structures.find(item => item.id === worker.targetStructureId && item.status !== 'complete') || null;
    if (!target) {
      target = nearestIncomplete(worker);
      worker.targetStructureId = target?.id || null;
      worker.state = target ? (structureNeedsMaterials(target) ? 'fetching' : 'building') : 'idle';
    }
    if (!target) {
      moveToward(worker, settlement, 3.2, dt);
      return;
    }

    if (worker.state === 'fetching') {
      if (moveToward(worker, settlement, 8.5, dt)) {
        if (!loadCargo(worker, target)) {
          if (!structureNeedsMaterials(target)) worker.state = 'building';
          else worker.state = 'waiting-materials';
        }
      }
      return;
    }

    if (worker.state === 'waiting-materials') {
      if (!structureNeedsMaterials(target)) worker.state = 'building';
      else if ((settlement.stockpile.wood > 0 && target.delivered.wood < target.required.wood) || (settlement.stockpile.stone > 0 && target.delivered.stone < target.required.stone)) worker.state = 'fetching';
      return;
    }

    if (worker.state === 'hauling') {
      if (moveToward(worker, target, 6.8, dt)) unloadCargo(worker, target);
      return;
    }

    if (worker.state === 'building') {
      if (structureNeedsMaterials(target)) {
        worker.state = 'fetching';
        return;
      }
      if (!moveToward(worker, target, 5.8, dt)) return;
      const work = 1.15 * constructionMultiplier() * dt;
      target.workDone = Math.min(target.workRequired, target.workDone + work);
      target.progress = clamp(target.workDone / Math.max(1, target.workRequired));
      target.status = 'construction';
      stats.constructionWorkTicks++;
      if (target.workDone >= target.workRequired) {
        completeStructure(target);
        worker.targetStructureId = null;
        worker.state = 'idle';
      }
      return;
    }

    worker.state = structureNeedsMaterials(target) ? 'fetching' : 'building';
  }

  function constructionStep() {
    if (state.settlement) {
      productionStep(STEP_SECONDS);
      for (const worker of state.workers) workerStep(worker, STEP_SECONDS);
      recomputeSettlement();
    }
    stats.steps++;
    if (stats.steps % 4 === 0) saveState();
  }

  const previousStep = modules.step.bind(modules);
  modules.step = function v68RunevaleSettlementStep(dt) {
    const result = previousStep(dt);
    accumulator += Math.max(0, Number(dt) || 0);
    while (accumulator >= STEP_SECONDS) {
      accumulator -= STEP_SECONDS;
      constructionStep();
    }
    return result;
  };

  function ensureOverlay() {
    const layer = document.getElementById('surfaceModeLayer');
    const surfaceCanvas = document.getElementById('surfaceModeCanvas');
    if (!layer || !surfaceCanvas) return false;
    if (!overlayCanvas) {
      overlayCanvas = document.createElement('canvas');
      overlayCanvas.id = 'runevaleSettlementCanvasV68';
      Object.assign(overlayCanvas.style, {
        position:'absolute', inset:'0', width:'100%', height:'100%', display:'block',
        zIndex:'1', pointerEvents:'none',
      });
      layer.appendChild(overlayCanvas);
      overlayCtx = overlayCanvas.getContext('2d');
    }
    if (!buildHud) createBuildHud(layer);
    if (overlayCanvas.width !== surfaceCanvas.width) overlayCanvas.width = surfaceCanvas.width;
    if (overlayCanvas.height !== surfaceCanvas.height) overlayCanvas.height = surfaceCanvas.height;
    return Boolean(overlayCtx);
  }

  function projectPoint(wx, wy, z, player, width, height) {
    const dx = shortestWrappedDelta(wx, player.x, world.width);
    const dy = wy - player.y;
    const forward = dx * Math.cos(player.yaw) + dy * Math.sin(player.yaw);
    if (forward <= 0.5 || forward > 210) return null;
    const side = -dx * Math.sin(player.yaw) + dy * Math.cos(player.yaw);
    const focal = width / (2 * Math.tan(FOV * 0.5));
    const eyeZ = groundZAt(player.x, player.y) + player.altitude;
    const horizon = height * clamp(0.49 + player.pitch * 0.46, 0.18, 0.80);
    const x = width * 0.5 + side / forward * focal;
    const y = horizon - ((z - eyeZ) / forward) * focal;
    if (x < -120 || x > width + 120 || y < -200 || y > height + 200) return null;
    return { x, y, depth:forward, scale:focal / forward };
  }

  function structureColor(structure) {
    if (structure.status === 'blueprint') return 'rgba(168,213,231,.55)';
    if (structure.status === 'construction') return 'rgba(198,169,111,.86)';
    if (['tower','gatehouse','keep','well'].includes(structure.type)) return 'rgba(139,139,132,.98)';
    if (structure.type === 'farm') return 'rgba(153,132,70,.95)';
    return 'rgba(117,83,54,.98)';
  }

  function drawStructure(structure, player, width, height, ghost = false) {
    const spec = BUILDINGS[structure.type];
    const ground = groundZAt(structure.x, structure.y);
    const base = projectPoint(structure.x, structure.y, ground, player, width, height);
    const top = projectPoint(structure.x, structure.y, ground + spec.height, player, width, height);
    if (!base || !top) return false;
    const h = clamp(base.y - top.y, 3, height * 0.62);
    const w = clamp(spec.width * base.scale, 3, width * 0.48);
    const ctx = overlayCtx;
    ctx.save();
    ctx.globalAlpha = ghost ? 0.42 : 1;
    ctx.fillStyle = ghost ? 'rgba(146,224,190,.42)' : structureColor(structure);
    ctx.strokeStyle = ghost || structure.status === 'blueprint' ? 'rgba(211,244,235,.9)' : 'rgba(34,28,22,.9)';
    ctx.lineWidth = clamp(h * 0.035, 1, 3);
    if (ghost || structure.status === 'blueprint') ctx.setLineDash([5,4]);

    const x = base.x;
    const y = base.y;
    if (structure.type === 'palisade') {
      ctx.fillRect(x - w * 0.5, y - h, w, h);
      for (let px = x - w * 0.48; px < x + w * 0.5; px += Math.max(3, w / 9)) {
        ctx.beginPath();
        ctx.moveTo(px, y - h);
        ctx.lineTo(px + w / 18, y - h - h * 0.16);
        ctx.lineTo(px + w / 9, y - h);
        ctx.fill();
      }
      ctx.strokeRect(x - w * 0.5, y - h, w, h);
    } else if (structure.type === 'gatehouse') {
      ctx.fillRect(x - w * 0.5, y - h * 0.72, w, h * 0.72);
      ctx.fillRect(x - w * 0.48, y - h, w * 0.22, h);
      ctx.fillRect(x + w * 0.26, y - h, w * 0.22, h);
      ctx.clearRect(x - w * 0.12, y - h * 0.48, w * 0.24, h * 0.48);
      ctx.strokeRect(x - w * 0.5, y - h * 0.72, w, h * 0.72);
    } else if (structure.type === 'tower' || structure.type === 'keep') {
      ctx.fillRect(x - w * 0.5, y - h, w, h);
      const crenels = structure.type === 'keep' ? 7 : 5;
      for (let i = 0; i < crenels; i++) ctx.fillRect(x - w * 0.5 + i * w / crenels, y - h - h * 0.08, w / crenels * 0.55, h * 0.11);
      ctx.strokeRect(x - w * 0.5, y - h, w, h);
    } else if (structure.type === 'well') {
      ctx.beginPath();
      ctx.ellipse(x, y - h * 0.26, w * 0.5, h * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeRect(x - w * 0.42, y - h * 0.48, w * 0.84, h * 0.38);
    } else if (structure.type === 'farm') {
      ctx.fillRect(x - w * 0.5, y - h * 0.35, w, h * 0.35);
      ctx.strokeRect(x - w * 0.5, y - h * 0.35, w, h * 0.35);
      ctx.beginPath();
      for (let i = -4; i <= 4; i++) {
        ctx.moveTo(x + i * w / 10, y);
        ctx.lineTo(x + i * w / 10 + w * 0.12, y - h * 0.28);
      }
      ctx.stroke();
    } else {
      ctx.fillRect(x - w * 0.5, y - h * 0.72, w, h * 0.72);
      ctx.beginPath();
      ctx.moveTo(x - w * 0.58, y - h * 0.72);
      ctx.lineTo(x, y - h);
      ctx.lineTo(x + w * 0.58, y - h * 0.72);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeRect(x - w * 0.5, y - h * 0.72, w, h * 0.72);
    }

    if (!ghost && structure.status !== 'complete') {
      const progress = structure.status === 'blueprint' ? 0 : structure.progress;
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(0,0,0,.66)';
      ctx.fillRect(x - w * 0.42, y + 5, w * 0.84, 4);
      ctx.fillStyle = 'rgba(215,235,185,.95)';
      ctx.fillRect(x - w * 0.42, y + 5, w * 0.84 * progress, 4);
    }
    ctx.restore();
    return true;
  }

  function drawWorker(worker, player, width, height) {
    const ground = groundZAt(worker.x, worker.y);
    const base = projectPoint(worker.x, worker.y, ground, player, width, height);
    const top = projectPoint(worker.x, worker.y, ground + 1.7, player, width, height);
    if (!base || !top) return false;
    const h = clamp(base.y - top.y, 3, 42);
    overlayCtx.save();
    overlayCtx.fillStyle = worker.cargo.wood > 0 || worker.cargo.stone > 0 ? 'rgba(237,198,122,.98)' : 'rgba(226,218,196,.96)';
    overlayCtx.strokeStyle = 'rgba(27,24,20,.9)';
    overlayCtx.lineWidth = 1;
    overlayCtx.beginPath();
    overlayCtx.arc(base.x, base.y - h * 0.72, h * 0.16, 0, Math.PI * 2);
    overlayCtx.fill();
    overlayCtx.stroke();
    overlayCtx.fillRect(base.x - h * 0.13, base.y - h * 0.58, h * 0.26, h * 0.52);
    overlayCtx.restore();
    return true;
  }

  function renderOverlay(now = performance.now()) {
    requestAnimationFrame(renderOverlay);
    if (!surface.isActive?.() || now - lastRender < 1000 / 30) {
      if (buildHud) buildHud.style.display = surface.isActive?.() ? '' : 'none';
      return;
    }
    lastRender = now;
    if (!ensureOverlay()) return;
    buildHud.style.display = '';
    const width = overlayCanvas.width;
    const height = overlayCanvas.height;
    overlayCtx.clearRect(0, 0, width, height);
    const player = surface.getPlayer();
    const visible = state.structures
      .map(structure => ({ structure, d:distance(player, structure) }))
      .filter(item => item.d < 210)
      .sort((a,b) => b.d - a.d);
    let renderedStructures = 0;
    for (const item of visible) if (drawStructure(item.structure, player, width, height)) renderedStructures++;
    let renderedWorkers = 0;
    for (const worker of state.workers) if (distance(player, worker) < 180 && drawWorker(worker, player, width, height)) renderedWorkers++;
    if (panelOpen && state.settlement) {
      const ghost = candidatePlacement(selectedType);
      if (ghost && placementIsClear(ghost).ok) drawStructure({ ...ghost, status:'blueprint', progress:0 }, player, width, height, true);
    }
    stats.renderedStructures = renderedStructures;
    stats.renderedWorkers = renderedWorkers;
    if (now - lastUiRefresh > 250) refreshUi();
  }
  requestAnimationFrame(renderOverlay);

  function button(label, handler, compact = false) {
    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = label;
    Object.assign(el.style, {
      minHeight:compact ? '34px' : '39px',
      padding:compact ? '6px 8px' : '8px 10px',
      border:'1px solid rgba(220,233,221,.25)',
      borderRadius:'8px',
      background:'rgba(12,22,18,.88)',
      color:'#eef6ee',
      font:'600 10px/1.1 ui-monospace, SFMono-Regular, Menlo, monospace',
      cursor:'pointer',
      touchAction:'manipulation',
    });
    el.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      handler();
    });
    return el;
  }

  function flash(message) {
    if (!buildHud) return;
    const notice = buildHud.querySelector('.runevale-v68-notice');
    if (!notice) return;
    notice.textContent = message;
    notice.style.opacity = '1';
    clearTimeout(flash.timer);
    flash.timer = setTimeout(() => { notice.style.opacity = '.68'; }, 1800);
  }

  function actionResult(result, successText) {
    if (result?.ok) flash(successText || 'Done.');
    else flash(result?.reason || 'Action unavailable.');
  }

  function createBuildHud(layer) {
    buildHud = document.createElement('div');
    buildHud.id = 'runevaleSettlementHudV68';
    Object.assign(buildHud.style, {
      position:'absolute', left:'max(12px, env(safe-area-inset-left))', bottom:'max(12px, env(safe-area-inset-bottom))',
      zIndex:'4', pointerEvents:'auto', color:'#eef6ee', fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace',
      width:'min(360px, calc(100vw - 24px))',
    });

    const toggle = button('🏰 Build [B]', () => { panelOpen = !panelOpen; refreshUi(true); });
    toggle.className = 'runevale-v68-toggle';
    buildHud.appendChild(toggle);

    buildPanel = document.createElement('div');
    Object.assign(buildPanel.style, {
      marginTop:'7px', padding:'9px', border:'1px solid rgba(210,232,215,.25)', borderRadius:'11px',
      background:'rgba(5,13,10,.89)', backdropFilter:'blur(8px)', boxShadow:'0 10px 35px rgba(0,0,0,.35)',
      maxHeight:'min(68vh, 520px)', overflow:'auto',
    });
    buildPanel.innerHTML = '<div style="font-size:11px;font-weight:800;letter-spacing:.08em">RUNEVALE · FOUNDING MODE</div><div class="runevale-v68-summary" style="font-size:9px;line-height:1.45;margin-top:6px;opacity:.86"></div>';

    const resourceRow = document.createElement('div');
    Object.assign(resourceRow.style, { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px', marginTop:'8px' });
    resourceRow.append(
      button('Gather wood [G]', () => { const r = gatherWood(); actionResult(r, r.ok ? `+${r.wood} wood` : ''); }, true),
      button('Quarry stone [V]', () => { const r = gatherStone(); actionResult(r, r.ok ? `+${r.stone} stone` : ''); }, true),
    );
    buildPanel.appendChild(resourceRow);

    const foundRow = document.createElement('div');
    foundRow.className = 'runevale-v68-found-row';
    Object.assign(foundRow.style, { marginTop:'7px' });
    foundRow.appendChild(button('Found settlement here', () => {
      const r = foundSettlement();
      actionResult(r, r.ok ? `${r.settlement.name} founded · ${r.settlement.houseName}` : '');
    }));
    buildPanel.appendChild(foundRow);

    const grid = document.createElement('div');
    grid.className = 'runevale-v68-building-grid';
    Object.assign(grid.style, { display:'grid', gridTemplateColumns:'repeat(2,minmax(0,1fr))', gap:'5px', marginTop:'8px' });
    Object.entries(BUILDINGS).forEach(([type, spec], index) => {
      const el = button(`${index + 1}. ${spec.label}\n${spec.wood}w · ${spec.stone}s`, () => { selectedType = type; refreshUi(true); }, true);
      el.dataset.buildingType = type;
      el.style.whiteSpace = 'pre-line';
      grid.appendChild(el);
    });
    buildPanel.appendChild(grid);

    const place = button('Place blueprint ahead [P]', () => {
      const r = placeBlueprint(selectedType);
      actionResult(r, r.ok ? `${BUILDINGS[selectedType].label} blueprint placed` : '');
    });
    place.className = 'runevale-v68-place';
    place.style.width = '100%';
    place.style.marginTop = '8px';
    buildPanel.appendChild(place);

    const notice = document.createElement('div');
    notice.className = 'runevale-v68-notice';
    notice.textContent = 'Gather → found → place → settlers haul and build.';
    Object.assign(notice.style, { marginTop:'7px', fontSize:'8px', lineHeight:'1.4', opacity:'.68' });
    buildPanel.appendChild(notice);
    buildHud.appendChild(buildPanel);
    layer.appendChild(buildHud);
    refreshUi(true);
  }

  function refreshUi(force = false) {
    if (!buildHud) return;
    const now = performance.now();
    if (!force && now - lastUiRefresh < 220) return;
    lastUiRefresh = now;
    buildPanel.style.display = panelOpen ? '' : 'none';
    const settlement = state.settlement;
    const stock = storage();
    const summary = buildHud.querySelector('.runevale-v68-summary');
    const foundRow = buildHud.querySelector('.runevale-v68-found-row');
    if (summary) {
      summary.innerHTML = settlement
        ? `<b>${settlement.name}</b> · ${settlement.houseName}<br>wood ${Math.floor(stock.wood)} · stone ${Math.floor(stock.stone)} · food ${stock.food.toFixed(1)} · water ${stock.water.toFixed(1)}<br>population ${settlement.population}/${settlement.housing} housed · defense ${settlement.defense} · territory ${settlement.territoryRadius.toFixed(0)} · builds ${settlement.completedStructures}/${state.structures.length}`
        : `pack: wood ${Math.floor(stock.wood)} · stone ${Math.floor(stock.stone)}<br>Gather local materials, then found your first persistent settlement.`;
    }
    if (foundRow) foundRow.style.display = settlement ? 'none' : '';
    for (const el of buildHud.querySelectorAll('[data-building-type]')) {
      const active = el.dataset.buildingType === selectedType;
      el.style.outline = active ? '2px solid rgba(174,224,191,.72)' : 'none';
      el.style.background = active ? 'rgba(38,73,52,.92)' : 'rgba(12,22,18,.88)';
    }
    const place = buildHud.querySelector('.runevale-v68-place');
    if (place) place.disabled = !settlement;
  }

  window.addEventListener('keydown', event => {
    if (!surface.isActive?.()) return;
    if (event.repeat) return;
    if (event.code === 'KeyB') {
      event.preventDefault();
      panelOpen = !panelOpen;
      refreshUi(true);
    } else if (event.code === 'KeyG') {
      event.preventDefault();
      const r = gatherWood();
      actionResult(r, r.ok ? `+${r.wood} wood` : '');
    } else if (event.code === 'KeyV') {
      event.preventDefault();
      const r = gatherStone();
      actionResult(r, r.ok ? `+${r.stone} stone` : '');
    } else if (event.code === 'KeyP') {
      event.preventDefault();
      const r = placeBlueprint(selectedType);
      actionResult(r, r.ok ? `${BUILDINGS[selectedType].label} blueprint placed` : '');
    } else if (/^Digit[1-8]$/.test(event.code)) {
      const index = Number(event.code.slice(-1)) - 1;
      const type = Object.keys(BUILDINGS)[index];
      if (type) {
        event.preventDefault();
        selectedType = type;
        panelOpen = true;
        refreshUi(true);
      }
    }
  }, { passive:false });

  function retrofitStructure(structureId, targetType) {
    const id = Number(structureId);
    const structure = state.structures.find(item => item.id === id);
    if (!structure) return { ok:false, reason:'Structure not found.' };
    if (structure.status !== 'complete') return { ok:false, reason:'Only completed structures can be retrofitted.' };
    if (!(structure.type === 'palisade' && targetType === 'gatehouse')) {
      return { ok:false, reason:'This retrofit path is not supported.' };
    }
    const fromType = structure.type;
    const fromSpec = BUILDINGS[fromType];
    const toSpec = BUILDINGS[targetType];
    if (!fromSpec || !toSpec) return { ok:false, reason:'Unknown retrofit building type.' };

    const preserved = {
      wood:Math.min(toSpec.wood, Math.max(Number(structure.delivered?.wood) || 0, fromSpec.wood)),
      stone:Math.min(toSpec.stone, Math.max(Number(structure.delivered?.stone) || 0, fromSpec.stone)),
      work:Math.min(toSpec.work, Math.max(Number(structure.workDone) || 0, fromSpec.work)),
    };
    const deltaRequired = {
      wood:Math.max(0, toSpec.wood - preserved.wood),
      stone:Math.max(0, toSpec.stone - preserved.stone),
      work:Math.max(0, toSpec.work - preserved.work),
    };

    structure.type = targetType;
    structure.required = { wood:toSpec.wood, stone:toSpec.stone };
    structure.delivered = { wood:preserved.wood, stone:preserved.stone };
    structure.workRequired = toSpec.work;
    structure.workDone = preserved.work;
    structure.progress = clamp(structure.workDone / Math.max(1, structure.workRequired));
    structure.status = structureNeedsMaterials(structure) ? 'blueprint' : 'construction';
    structure.completedAtStep = null;
    structure.retrofit = {
      fromType,
      toType:targetType,
      startedAtStep:stats.steps,
      completedAtStep:null,
      completed:false,
      preserved:{ ...preserved },
      deltaRequired:{ ...deltaRequired },
    };
    stats.structureRetrofitsStarted++;
    recomputeSettlement();
    saveState();
    refreshUi(true);
    return { ok:true, structure:copy(structure), retrofit:copy(structure.retrofit) };
  }

  function resetForTest() {
    try { localStorage.removeItem(persistenceKey); } catch {}
    state = blankState();
    stats.steps = 0;
    stats.woodHarvestEvents = 0;
    stats.stoneHarvestEvents = 0;
    stats.ecologicalResourceDebited = 0;
    stats.stoneReserveDebited = 0;
    stats.settlementsFounded = 0;
    stats.blueprintsPlaced = 0;
    stats.materialHauls = 0;
    stats.constructionWorkTicks = 0;
    stats.structuresCompleted = 0;
    stats.structureRetrofitsStarted = 0;
    stats.structureRetrofitsCompleted = 0;
    stats.settlersBorn = 0;
    stats.foodProduced = 0;
    stats.waterProduced = 0;
    stats.defense = 0;
    stats.territoryRadius = 0;
    saveState();
    refreshUi(true);
  }

  const api = {
    installed:true,
    version:VERSION,
    catalog:copy(BUILDINGS),
    getState:() => copy(state),
    getStats:() => ({
      ...stats,
      installed:true,
      version:VERSION,
      gameplayLayer:'runevale-inside-nysa-surface-mode',
      originalRunevaleSourceImported:false,
      usesExistingSurfacePlayer:true,
      woodHarvestUsesRealEcologicalResourceEntities:true,
      woodHarvestDepletesEcologicalBiomass:true,
      stoneUsesFiniteTerrainDerivedLocalReserve:true,
      constructionMaterialsPhysicallyHauledByWorkers:true,
      constructionProgressRequiresDeliveredMaterials:true,
      structuresRenderedInSameSurfaceWorld:true,
      structuresPersistByWorldSeed:true,
      settlementPopulationRequiresHousingFoodAndWater:true,
      dynastyIdentityDerivedFromSettlement:true,
      castleDefenseDerivedFromCompletedStructures:true,
      territoryDerivedFromBuiltInfrastructure:true,
      noHardBuildingCap:true,
      noHardPopulationCap:true,
      noHardDisplayCap:true,
      authoritativeFixedStep:true,
      maxStructures:null,
      maxWorkers:null,
    }),
    gatherWood,
    gatherStone,
    foundSettlement,
    placeBlueprint,
    retrofitStructure,
    selectBuilding(type) {
      if (!BUILDINGS[type]) return false;
      selectedType = type;
      refreshUi(true);
      return true;
    },
    getSelectedBuilding:() => selectedType,
    setPanelOpen(value) { panelOpen = Boolean(value); refreshUi(true); },
    recomputeSettlement,
    resetForTest,
  };

  window.realitySandboxRunevaleSettlementV68 = api;
  document.documentElement.dataset.runevaleSettlementV68 = 'surface-castle-foundation';
  document.documentElement.dataset.runevaleNysaBridge = 'v68-settlement-foundation';
  ensureOverlay();
  recomputeSettlement();
  refreshUi(true);
}

waitForRuntime().then(install);
