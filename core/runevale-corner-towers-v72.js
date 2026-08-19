const VERSION = 'v72a-derived-physical-corner-towers';
const TOWER_WIDTH = 4.2;
const TOWER_SLOPE_LIMIT = 0.085;
const MIN_TURN_ANGLE = 0.45;
const MIN_INTERIOR_ANGLE = 0.45;
const TOWER_MATCH_RADIUS = 2.25;
const TARGET_DISTANCE = 48;
const TARGET_FORWARD_DOT = 0.15;

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number(v) || 0));
const wrap = (value, max) => ((value % max) + max) % max;

async function waitForRuntime() {
  for (let attempt = 0; attempt < 400; attempt++) {
    const settlement = window.realitySandboxRunevaleSettlementV68;
    const v69 = window.realitySandboxRunevaleCastlePerimetersV69;
    const surface = window.realitySandboxSurfaceMode;
    const planet = window.realitySandboxPlanet;
    if (
      settlement?.installed && typeof settlement.placeJunctionTower === 'function' && v69?.installed &&
      surface?.getPlayer && planet?.living?.sampleDynamicPlanet && planet?.waterCycle?.sample
    ) return { settlement, v69, surface, planet };
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  return null;
}

function install({ settlement, v69, surface, planet }) {
  if (window.realitySandboxRunevaleCornerTowersV72?.installed) return;

  const { world, living, waterCycle } = planet;
  const towerSpec = settlement.catalog?.tower || { wood:8, stone:12, work:18, width:TOWER_WIDTH };
  let junctionReads = 0;
  let buildRequests = 0;
  let buildAccepted = 0;
  let footprintRejections = 0;
  let straightJunctionRejections = 0;
  let targetMisses = 0;
  let lastValidation = null;
  let lastBuild = null;

  function shortestWrappedDelta(value, origin, size) {
    let delta = value - origin;
    if (delta > size * 0.5) delta -= size;
    else if (delta < -size * 0.5) delta += size;
    return delta;
  }

  function distance(a, b) {
    return Math.hypot(shortestWrappedDelta(b.x, a.x, world.width), b.y - a.y);
  }

  function vectorBetween(a, b) {
    return { x:shortestWrappedDelta(b.x, a.x, world.width), y:b.y - a.y };
  }

  function angleBetweenVectors(a, b) {
    const ma = Math.hypot(a.x, a.y);
    const mb = Math.hypot(b.x, b.y);
    if (ma < 1e-9 || mb < 1e-9) return 0;
    const dot = clamp((a.x * b.x + a.y * b.y) / (ma * mb), -1, 1);
    return Math.acos(dot);
  }

  function towerNearNode(state, node) {
    let best = null;
    for (const structure of state.structures || []) {
      if (structure.type !== 'tower') continue;
      const d = distance(node, structure);
      if (d <= TOWER_MATCH_RADIUS && (!best || d < best.distance)) best = { structure, distance:d };
    }
    return best;
  }

  function deriveJunctions() {
    junctionReads++;
    const graph = v69.getPerimeters({ completedOnly:true });
    const state = settlement.getState();
    const nodeById = new Map((graph.nodes || []).map(node => [node.id, node]));
    const edgesByNode = new Map();
    for (const edge of graph.edges || []) {
      if (!edgesByNode.has(edge.a)) edgesByNode.set(edge.a, []);
      if (!edgesByNode.has(edge.b)) edgesByNode.set(edge.b, []);
      edgesByNode.get(edge.a).push(edge);
      edgesByNode.get(edge.b).push(edge);
    }

    const junctions = [];
    for (const node of graph.nodes || []) {
      const edges = edgesByNode.get(node.id) || [];
      if (edges.length !== 2) continue;
      const vectors = edges.map(edge => {
        const otherId = edge.a === node.id ? edge.b : edge.a;
        const other = nodeById.get(otherId);
        return other ? vectorBetween(node, other) : { x:0, y:0 };
      });
      const interiorAngle = angleBetweenVectors(vectors[0], vectors[1]);
      const turnAngle = Math.PI - interiorAngle;
      const isCorner = turnAngle >= MIN_TURN_ANGLE && interiorAngle >= MIN_INTERIOR_ANGLE;
      const tower = towerNearNode(state, node);
      junctions.push({
        nodeId:node.id,
        x:node.x,
        y:node.y,
        degree:edges.length,
        wallIds:edges.map(edge => edge.structureId),
        wallTypes:edges.map(edge => edge.type),
        interiorAngle,
        turnAngle,
        isCorner,
        towerId:tower?.structure?.id || null,
        towerStatus:tower?.structure?.status || null,
        reinforced:Boolean(tower?.structure?.status === 'complete'),
        eligible:Boolean(isCorner && !tower),
      });
    }
    return { graph, junctions };
  }

  function getJunctions() {
    return deriveJunctions().junctions;
  }

  function getCornerJunctions() {
    return getJunctions().filter(item => item.isCorner);
  }

  function sampleTowerFootprint(junction) {
    const width = Number(towerSpec.width) || TOWER_WIDTH;
    const samples = [];
    for (const u of [-width * 0.5, 0, width * 0.5]) {
      for (const v of [-width * 0.5, 0, width * 0.5]) {
        const x = wrap(junction.x + u, world.width);
        const y = clamp(junction.y + v, 0.02, world.height - 0.02);
        const terrain = living.sampleDynamicPlanet(x, y, 'v72-corner-tower-exact');
        const water = waterCycle.sample(x, y, 'v72-corner-tower-exact');
        samples.push({
          u, v, x, y,
          land:Boolean(terrain?.land),
          elevation:Number(terrain?.elevation) || 0,
          lake:Number(water?.lake) || 0,
        });
      }
    }
    return samples;
  }

  function validateCornerTower(nodeId) {
    const junction = getJunctions().find(item => item.nodeId === Number(nodeId));
    if (!junction) {
      const result = { ok:false, reason:'No completed two-wall junction exists at that graph node.', nodeId:Number(nodeId), samples:[] };
      lastValidation = result;
      return result;
    }
    if (!junction.isCorner) {
      straightJunctionRejections++;
      const result = { ok:false, reason:'Corner towers require a real turn; this junction is a straight continuation.', junction, samples:[] };
      lastValidation = result;
      return result;
    }
    if (junction.towerId) {
      const result = { ok:false, reason:'A tower already occupies this derived wall junction.', junction, samples:[] };
      lastValidation = result;
      return result;
    }

    const samples = sampleTowerFootprint(junction);
    const dry = samples.every(sample => sample.land && sample.lake <= 0.45);
    const elevations = samples.map(sample => sample.elevation);
    const elevationRange = Math.max(...elevations) - Math.min(...elevations);
    if (!dry) {
      footprintRejections++;
      const result = { ok:false, reason:'The corner tower footprint crosses water or non-buildable ground.', junction, samples, elevationRange, slopeLimit:TOWER_SLOPE_LIMIT };
      lastValidation = result;
      return result;
    }
    if (elevationRange > TOWER_SLOPE_LIMIT) {
      footprintRejections++;
      const result = { ok:false, reason:`The corner tower footprint is too steep (${elevationRange.toFixed(3)} > ${TOWER_SLOPE_LIMIT.toFixed(3)}).`, junction, samples, elevationRange, slopeLimit:TOWER_SLOPE_LIMIT };
      lastValidation = result;
      return result;
    }

    const result = { ok:true, junction, samples, elevationRange, slopeLimit:TOWER_SLOPE_LIMIT };
    lastValidation = result;
    return result;
  }

  function buildCornerTower(nodeId) {
    buildRequests++;
    const validation = validateCornerTower(nodeId);
    if (!validation.ok) {
      const result = { ...validation, requestedType:'tower' };
      lastBuild = result;
      return result;
    }
    const beforeState = settlement.getState();
    const stockBefore = beforeState.settlement ? { ...beforeState.settlement.stockpile } : null;
    const result = settlement.placeJunctionTower(
      validation.junction.x,
      validation.junction.y,
      validation.junction.wallIds
    );
    if (!result?.ok) {
      const rejected = { ...result, validation, stockBefore };
      lastBuild = rejected;
      return rejected;
    }
    buildAccepted++;
    const afterState = settlement.getState();
    const tower = afterState.structures.find(item => item.id === result.structure.id) || result.structure;
    const built = {
      ok:true,
      validation,
      structure:tower,
      stockBefore,
      wallIds:[...validation.junction.wallIds],
      cornerAngle:result.cornerAngle,
    };
    lastBuild = built;
    return built;
  }

  function nearestCornerInFront() {
    const player = surface.getPlayer();
    const fx = Math.cos(player.yaw || 0);
    const fy = Math.sin(player.yaw || 0);
    let best = null;
    for (const junction of getCornerJunctions()) {
      if (!junction.eligible) continue;
      const dx = shortestWrappedDelta(junction.x, player.x, world.width);
      const dy = junction.y - player.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.01 || d > TARGET_DISTANCE) continue;
      const forwardDot = (dx / d) * fx + (dy / d) * fy;
      if (forwardDot < TARGET_FORWARD_DOT) continue;
      const score = d * (1.15 - Math.min(1, forwardDot) * 0.35);
      if (!best || score < best.score) best = { junction, distance:d, forwardDot, score };
    }
    return best;
  }

  function buildNearestCornerTower() {
    const target = nearestCornerInFront();
    if (!target) {
      targetMisses++;
      const result = { ok:false, reason:'No eligible completed wall corner is in front of you.' };
      lastBuild = result;
      notify(result.reason);
      return result;
    }
    const result = buildCornerTower(target.junction.nodeId);
    notify(result.ok ? `Corner tower queued · ${towerSpec.wood} wood · ${towerSpec.stone} stone · ${towerSpec.work} work` : result.reason);
    return result;
  }

  function notify(message) {
    const notice = document.querySelector('#runevaleSettlementHudV68 .runevale-v68-notice');
    if (notice) notice.textContent = message;
  }

  function installHudButton() {
    const panel = document.querySelector('#runevaleSettlementHudV68 > div:nth-child(2)');
    if (!panel || panel.querySelector('.runevale-v72-corner-tower')) return false;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'runevale-v72-corner-tower';
    button.textContent = 'Build corner tower [T]';
    Object.assign(button.style, {
      width:'100%', marginTop:'6px', minHeight:'36px', padding:'7px 9px',
      border:'1px solid rgba(220,233,221,.25)', borderRadius:'8px',
      background:'rgba(43,45,48,.94)', color:'#f0f2f3',
      font:'600 10px/1.1 ui-monospace, SFMono-Regular, Menlo, monospace', cursor:'pointer', touchAction:'manipulation',
    });
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      buildNearestCornerTower();
    });
    panel.appendChild(button);
    return true;
  }

  // Keep the extension control alive when v68 refreshes/rebuilds its build HUD.
  // The physical tower API is independent of presentation; this observer only
  // restores the affordance into the current owner panel when DOM nodes change.
  installHudButton();
  const hudObserver = new MutationObserver(() => installHudButton());
  hudObserver.observe(document.documentElement, { childList:true, subtree:true });

  window.addEventListener('keydown', event => {
    if (!surface.isActive?.() || event.repeat || event.code !== 'KeyT') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    buildNearestCornerTower();
  }, { capture:true, passive:false });

  const previousGetStats = settlement.getStats.bind(settlement);
  settlement.getStats = () => {
    const junctions = getJunctions();
    return {
      ...previousGetStats(),
      v72CornerTowers:true,
      cornerTowersDerivedFromCompletedV69Junctions:true,
      straightWallJunctionsRejected:true,
      towerFootprintUsesExactNinePointTerrainValidation:true,
      junctionTowerUsesStandardV68TowerCosts:true,
      junctionTowerUsesExistingV68Workers:true,
      noStoredJunctionMembership:true,
      derivedCornerJunctions:junctions.filter(item => item.isCorner).length,
      reinforcedCornerJunctions:junctions.filter(item => item.reinforced).length,
      buildAccepted,
    };
  };

  const api = {
    installed:true,
    version:VERSION,
    getJunctions,
    getCornerJunctions,
    validateCornerTower,
    buildCornerTower,
    nearestCornerInFront,
    buildNearestCornerTower,
    getLastValidation:() => lastValidation ? JSON.parse(JSON.stringify(lastValidation)) : null,
    getLastBuild:() => lastBuild ? JSON.parse(JSON.stringify(lastBuild)) : null,
    getStats:() => ({
      installed:true,
      version:VERSION,
      footprintSampleCount:9,
      towerSlopeLimit:TOWER_SLOPE_LIMIT,
      minimumTurnAngle:MIN_TURN_ANGLE,
      towerMatchRadius:TOWER_MATCH_RADIUS,
      targetDistance:TARGET_DISTANCE,
      buildRequests,
      buildAccepted,
      footprintRejections,
      straightJunctionRejections,
      targetMisses,
      junctionReads,
      towerCost:{ wood:Number(towerSpec.wood) || 8, stone:Number(towerSpec.stone) || 12, work:Number(towerSpec.work) || 18 },
      junctionsDerivedFromCompletedV69Graph:true,
      straightContinuationsExcluded:true,
      exactPhysicalTowerFootprint:true,
      usesV68StandardTowerBlueprint:true,
      usesV68WorkersAndStockpile:true,
      wallEdgesRemainIntact:true,
      noStoredJunctionId:true,
      noStoredWallMembership:true,
      noHardCornerTowerCap:true,
      noHardBuildingCap:true,
      noHardPopulationCap:true,
      noHardDisplayCap:true,
    }),
  };

  window.realitySandboxRunevaleCornerTowersV72 = api;
  document.documentElement.dataset.runevaleCornerTowersV72 = 'derived-physical-corner-towers';
}

waitForRuntime().then(state => {
  if (!state) {
    document.documentElement.dataset.runevaleCornerTowersV72 = 'unavailable';
    return;
  }
  install(state);
});
