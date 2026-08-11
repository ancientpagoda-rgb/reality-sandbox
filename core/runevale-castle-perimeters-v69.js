const VERSION = 'v69a-footprint-snapping-derived-perimeters';
const SNAP_RADIUS = 3.25;
const NODE_MERGE_TOLERANCE = 1.15;
const LINEAR_TYPES = new Set(['palisade','gatehouse']);
const DEPTH_BY_TYPE = Object.freeze({
  palisade:0.85,
  gatehouse:4.4,
  house:4.2,
  tower:4.2,
  keep:8.2,
  farm:6.2,
  well:2.5,
  workshop:4.8,
});
const SLOPE_LIMIT_BY_TYPE = Object.freeze({
  palisade:0.13,
  gatehouse:0.095,
  house:0.085,
  tower:0.085,
  keep:0.065,
  farm:0.11,
  well:0.09,
  workshop:0.08,
});

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number(v) || 0));
const wrap = (value, max) => ((value % max) + max) % max;
const copy = value => JSON.parse(JSON.stringify(value));
const normAngle = value => {
  let a = Number(value) || 0;
  while (a <= -Math.PI) a += Math.PI * 2;
  while (a > Math.PI) a -= Math.PI * 2;
  return a;
};
const angleDistance = (a, b) => Math.abs(normAngle(a - b));

async function waitForRuntime() {
  for (let attempt = 0; attempt < 400; attempt++) {
    const settlement = window.realitySandboxRunevaleSettlementV68;
    const orientation = window.realitySandboxRunevaleBuildOrientationV68b;
    const surface = window.realitySandboxSurfaceMode;
    const planet = window.realitySandboxPlanet;
    if (
      settlement?.installed && orientation?.installed && surface?.getPlayer && surface?.enterAt &&
      planet?.living?.sampleDynamicPlanet && planet?.waterCycle?.sample
    ) return { settlement, orientation, surface, planet };
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  return null;
}

function install({ settlement, orientation, surface, planet }) {
  if (window.realitySandboxRunevaleCastlePerimetersV69?.installed) return;

  const { world, living, waterCycle } = planet;
  const catalog = settlement.catalog || {};
  const previousPlaceBlueprint = settlement.placeBlueprint.bind(settlement);
  const previousGetState = settlement.getState.bind(settlement);
  const previousGetStats = settlement.getStats.bind(settlement);
  let strictPlacements = 0;
  let rejectedFootprints = 0;
  let shorelineRejections = 0;
  let slopeRejections = 0;
  let overlapRejections = 0;
  let snappedPlacements = 0;
  let straightSnaps = 0;
  let cornerSnaps = 0;
  let derivedPerimeterReads = 0;
  let lastValidation = null;
  let lastPlacement = null;
  let chainMode = true;

  function shortestWrappedDelta(value, origin, size) {
    let delta = value - origin;
    if (delta > size * 0.5) delta -= size;
    else if (delta < -size * 0.5) delta += size;
    return delta;
  }

  function worldDistance(a, b) {
    return Math.hypot(shortestWrappedDelta(a.x, b.x, world.width), a.y - b.y);
  }

  function modelAngle(type, placementYaw) {
    return normAngle((Number(placementYaw) || 0) + (LINEAR_TYPES.has(type) ? Math.PI * 0.5 : 0));
  }

  function placementYawForModel(type, angle) {
    return normAngle((Number(angle) || 0) - (LINEAR_TYPES.has(type) ? Math.PI * 0.5 : 0));
  }

  function depthFor(type, spec) {
    return Math.max(0.5, Number(DEPTH_BY_TYPE[type]) || Number(spec?.width) * 0.72 || 2);
  }

  function rectangleFor(candidate) {
    const spec = catalog[candidate.type];
    if (!spec) return null;
    return {
      x:candidate.x,
      y:candidate.y,
      angle:modelAngle(candidate.type, candidate.rotation),
      width:Number(spec.width) || 1,
      depth:depthFor(candidate.type, spec),
      type:candidate.type,
      structureId:candidate.structureId ?? null,
    };
  }

  function worldPoint(rect, u, v) {
    const c = Math.cos(rect.angle);
    const s = Math.sin(rect.angle);
    return {
      x:wrap(rect.x + c * u - s * v, world.width),
      y:clamp(rect.y + s * u + c * v, 0.02, world.height - 0.02),
    };
  }

  function footprintSamples(candidate) {
    const rect = rectangleFor(candidate);
    if (!rect) return [];
    const us = [-rect.width * 0.5, 0, rect.width * 0.5];
    const vs = [-rect.depth * 0.5, 0, rect.depth * 0.5];
    const samples = [];
    for (const u of us) {
      for (const v of vs) {
        const point = worldPoint(rect, u, v);
        const terrain = living.sampleDynamicPlanet(point.x, point.y, 'v69-footprint-exact');
        const water = waterCycle.sample(point.x, point.y, 'v69-footprint-exact');
        samples.push({
          u,
          v,
          x:point.x,
          y:point.y,
          land:Boolean(terrain?.land),
          elevation:Number(terrain?.elevation) || 0,
          lake:Number(water?.lake) || 0,
        });
      }
    }
    return samples;
  }

  function wallEndpoints(candidateOrStructure) {
    const type = candidateOrStructure.type;
    if (!LINEAR_TYPES.has(type)) return [];
    const spec = catalog[type];
    if (!spec) return [];
    const angle = Number.isFinite(candidateOrStructure.modelRotation)
      ? normAngle(candidateOrStructure.rotation)
      : modelAngle(type, candidateOrStructure.rotation);
    const half = (Number(spec.width) || 1) * 0.5;
    const dx = Math.cos(angle) * half;
    const dy = Math.sin(angle) * half;
    return [
      { x:wrap(candidateOrStructure.x - dx, world.width), y:clamp(candidateOrStructure.y - dy, 0, world.height), end:0 },
      { x:wrap(candidateOrStructure.x + dx, world.width), y:clamp(candidateOrStructure.y + dy, 0, world.height), end:1 },
    ];
  }

  function existingRect(structure) {
    // v68b getState() exposes linear structures with presentation/model rotation
    // in `rotation`, and preserves the original placement yaw in `modelRotation`.
    const angle = LINEAR_TYPES.has(structure.type)
      ? Number(structure.rotation) || 0
      : Number(structure.rotation) || 0;
    const spec = catalog[structure.type];
    return {
      x:structure.x,
      y:structure.y,
      angle,
      width:Number(spec?.width) || 1,
      depth:depthFor(structure.type, spec),
      type:structure.type,
      structureId:structure.id,
    };
  }

  function axes(rect) {
    const c = Math.cos(rect.angle);
    const s = Math.sin(rect.angle);
    return [
      { x:c, y:s },
      { x:-s, y:c },
    ];
  }

  function projectedRadius(rect, axis) {
    const [xAxis, yAxis] = axes(rect);
    return Math.abs(axis.x * xAxis.x + axis.y * xAxis.y) * rect.width * 0.5 +
      Math.abs(axis.x * yAxis.x + axis.y * yAxis.y) * rect.depth * 0.5;
  }

  function rectanglesOverlap(a, b, tolerance = 0.08) {
    const dx = shortestWrappedDelta(b.x, a.x, world.width);
    const dy = b.y - a.y;
    for (const axis of [...axes(a), ...axes(b)]) {
      const centerProjection = Math.abs(dx * axis.x + dy * axis.y);
      if (centerProjection >= projectedRadius(a, axis) + projectedRadius(b, axis) - tolerance) return false;
    }
    return true;
  }

  function structuresShareEndpoint(candidate, structure) {
    if (!LINEAR_TYPES.has(candidate.type) || !LINEAR_TYPES.has(structure.type)) return false;
    const a = wallEndpoints(candidate);
    const b = wallEndpoints(structure);
    return a.some(pa => b.some(pb => worldDistance(pa, pb) <= NODE_MERGE_TOLERANCE));
  }

  function validateCandidate(candidate, { ignoreStructureId = null } = {}) {
    const spec = catalog[candidate.type];
    if (!spec) return { ok:false, reason:'Unknown building type.', candidate:copy(candidate), samples:[] };
    const samples = footprintSamples(candidate);
    const dry = samples.every(sample => sample.land && sample.lake <= 0.45);
    const elevations = samples.map(sample => sample.elevation);
    const elevationRange = Math.max(...elevations) - Math.min(...elevations);
    const slopeLimit = Number(SLOPE_LIMIT_BY_TYPE[candidate.type]) || 0.085;
    if (!dry) {
      rejectedFootprints++;
      shorelineRejections++;
      const result = { ok:false, reason:'The whole building footprint must remain on stable dry land.', candidate:copy(candidate), samples, elevationRange, slopeLimit, footprintDry:false };
      lastValidation = result;
      return result;
    }
    if (elevationRange > slopeLimit) {
      rejectedFootprints++;
      slopeRejections++;
      const result = { ok:false, reason:`Terrain varies too much across this footprint (${elevationRange.toFixed(3)} > ${slopeLimit.toFixed(3)}).`, candidate:copy(candidate), samples, elevationRange, slopeLimit, footprintDry:true };
      lastValidation = result;
      return result;
    }

    const state = previousGetState();
    const candidateRect = rectangleFor(candidate);
    for (const structure of state.structures || []) {
      if (structure.id === ignoreStructureId) continue;
      const otherRect = existingRect(structure);
      if (!rectanglesOverlap(candidateRect, otherRect)) continue;
      if (structuresShareEndpoint(candidate, structure)) continue;
      rejectedFootprints++;
      overlapRejections++;
      const result = { ok:false, reason:'The physical footprint overlaps another structure.', candidate:copy(candidate), samples, elevationRange, slopeLimit, footprintDry:true, overlapStructureId:structure.id };
      lastValidation = result;
      return result;
    }

    const result = { ok:true, candidate:copy(candidate), samples, elevationRange, slopeLimit, footprintDry:true };
    lastValidation = result;
    return result;
  }

  function candidateFromPlayer(type, distanceAhead = 10) {
    const player = surface.getPlayer();
    return {
      type,
      x:wrap(player.x + Math.cos(player.yaw) * distanceAhead, world.width),
      y:clamp(player.y + Math.sin(player.yaw) * distanceAhead, 0.05, world.height - 0.05),
      rotation:Number(player.yaw) || 0,
    };
  }

  function endpointRecords(state = previousGetState()) {
    const records = [];
    for (const structure of state.structures || []) {
      if (!LINEAR_TYPES.has(structure.type)) continue;
      for (const endpoint of wallEndpoints(structure)) {
        records.push({ ...endpoint, structureId:structure.id, type:structure.type, modelAngle:Number(structure.rotation) || 0 });
      }
    }
    return records;
  }

  function chooseSnappedModelAngle(candidateModelAngle, existingModelAngle) {
    const choices = [existingModelAngle, existingModelAngle + Math.PI * 0.5, existingModelAngle - Math.PI * 0.5, existingModelAngle + Math.PI];
    let best = choices[0];
    for (const choice of choices.slice(1)) if (angleDistance(candidateModelAngle, choice) < angleDistance(candidateModelAngle, best)) best = choice;
    return normAngle(best);
  }

  function snapLinearCandidate(candidate) {
    if (!LINEAR_TYPES.has(candidate.type) || !chainMode) return { candidate, snapped:false, snap:null };
    const state = previousGetState();
    const endpoints = endpointRecords(state);
    if (!endpoints.length) return { candidate, snapped:false, snap:null };

    const rawModelAngle = modelAngle(candidate.type, candidate.rotation);
    const rawEnds = wallEndpoints(candidate);
    let nearest = null;
    for (const endpoint of endpoints) {
      for (const rawEnd of rawEnds) {
        const d = worldDistance(endpoint, rawEnd);
        if (d <= SNAP_RADIUS && (!nearest || d < nearest.distance)) nearest = { endpoint, rawEnd, distance:d };
      }
    }
    if (!nearest) return { candidate, snapped:false, snap:null };

    const snappedModelAngle = chooseSnappedModelAngle(rawModelAngle, nearest.endpoint.modelAngle);
    const snappedPlacementYaw = placementYawForModel(candidate.type, snappedModelAngle);
    const spec = catalog[candidate.type];
    const half = (Number(spec?.width) || 1) * 0.5;
    const axisX = Math.cos(snappedModelAngle);
    const axisY = Math.sin(snappedModelAngle);

    // Choose whichever end of the new segment yields a center closest to the raw candidate.
    const centerA = {
      x:wrap(nearest.endpoint.x + axisX * half, world.width),
      y:clamp(nearest.endpoint.y + axisY * half, 0.02, world.height - 0.02),
    };
    const centerB = {
      x:wrap(nearest.endpoint.x - axisX * half, world.width),
      y:clamp(nearest.endpoint.y - axisY * half, 0.02, world.height - 0.02),
    };
    const chosen = worldDistance(centerA, candidate) <= worldDistance(centerB, candidate) ? centerA : centerB;
    const snapped = { ...candidate, x:chosen.x, y:chosen.y, rotation:snappedPlacementYaw };
    const turn = Math.min(angleDistance(snappedModelAngle, nearest.endpoint.modelAngle), angleDistance(snappedModelAngle, nearest.endpoint.modelAngle + Math.PI));
    return {
      candidate:snapped,
      snapped:true,
      snap:{
        structureId:nearest.endpoint.structureId,
        endpoint:nearest.endpoint.end,
        distanceBeforeSnap:nearest.distance,
        modelAngle:snappedModelAngle,
        kind:Math.abs(turn) < 0.15 ? 'straight' : 'corner',
      },
    };
  }

  function callV68AtCandidate(candidate, distanceAhead = 10) {
    const realGetPlayer = surface.getPlayer;
    const d = Math.max(0.1, Number(distanceAhead) || 10);
    const fakePlayer = {
      ...realGetPlayer(),
      x:wrap(candidate.x - Math.cos(candidate.rotation) * d, world.width),
      y:clamp(candidate.y - Math.sin(candidate.rotation) * d, 0.02, world.height - 0.02),
      yaw:candidate.rotation,
    };
    surface.getPlayer = () => ({ ...fakePlayer });
    try {
      return previousPlaceBlueprint(candidate.type, d);
    } finally {
      surface.getPlayer = realGetPlayer;
    }
  }

  function strictPlaceAt(type, x, y, placementYaw = 0, options = {}) {
    const raw = { type, x:wrap(Number(x) || 0, world.width), y:clamp(Number(y) || 0, 0.02, world.height - 0.02), rotation:normAngle(placementYaw) };
    const snappedResult = options.snap === false ? { candidate:raw, snapped:false, snap:null } : snapLinearCandidate(raw);
    const validation = validateCandidate(snappedResult.candidate);
    if (!validation.ok) return { ...validation, snapped:snappedResult.snapped, snap:snappedResult.snap };
    const result = callV68AtCandidate(snappedResult.candidate, options.distanceAhead || 10);
    if (!result?.ok) {
      const combined = { ...result, candidate:copy(snappedResult.candidate), validation, snapped:snappedResult.snapped, snap:snappedResult.snap };
      lastPlacement = combined;
      return combined;
    }
    strictPlacements++;
    if (snappedResult.snapped) {
      snappedPlacements++;
      if (snappedResult.snap?.kind === 'corner') cornerSnaps++;
      else straightSnaps++;
    }
    const combined = { ...result, candidate:copy(snappedResult.candidate), validation, snapped:snappedResult.snapped, snap:snappedResult.snap };
    lastPlacement = combined;
    return combined;
  }

  function strictPlaceBlueprint(type = settlement.getSelectedBuilding?.() || 'palisade', distanceAhead = 10) {
    const candidate = candidateFromPlayer(type, distanceAhead);
    return strictPlaceAt(type, candidate.x, candidate.y, candidate.rotation, { snap:true, distanceAhead });
  }

  function nodeForPoint(nodes, point) {
    for (const node of nodes) if (worldDistance(node, point) <= NODE_MERGE_TOLERANCE) return node;
    const node = { id:nodes.length + 1, x:point.x, y:point.y, edges:[] };
    nodes.push(node);
    return node;
  }

  function derivePerimeters({ completedOnly = true } = {}) {
    derivedPerimeterReads++;
    const state = previousGetState();
    const structures = (state.structures || []).filter(structure => LINEAR_TYPES.has(structure.type) && (!completedOnly || structure.status === 'complete'));
    const nodes = [];
    const edges = [];
    for (const structure of structures) {
      const ends = wallEndpoints(structure);
      if (ends.length !== 2) continue;
      const a = nodeForPoint(nodes, ends[0]);
      const b = nodeForPoint(nodes, ends[1]);
      const edge = { id:edges.length + 1, structureId:structure.id, type:structure.type, a:a.id, b:b.id, length:worldDistance(ends[0], ends[1]) };
      edges.push(edge);
      a.edges.push(edge.id);
      b.edges.push(edge.id);
    }

    const edgeById = new Map(edges.map(edge => [edge.id, edge]));
    const nodeById = new Map(nodes.map(node => [node.id, node]));
    const visitedNodes = new Set();
    const components = [];
    for (const start of nodes) {
      if (visitedNodes.has(start.id)) continue;
      const queue = [start.id];
      const componentNodeIds = [];
      const componentEdgeIds = new Set();
      while (queue.length) {
        const nodeId = queue.shift();
        if (visitedNodes.has(nodeId)) continue;
        visitedNodes.add(nodeId);
        componentNodeIds.push(nodeId);
        const node = nodeById.get(nodeId);
        for (const edgeId of node.edges) {
          componentEdgeIds.add(edgeId);
          const edge = edgeById.get(edgeId);
          const other = edge.a === nodeId ? edge.b : edge.a;
          if (!visitedNodes.has(other)) queue.push(other);
        }
      }
      const componentEdges = [...componentEdgeIds].map(id => edgeById.get(id));
      const closed = componentEdges.length >= 3 && componentEdges.length === componentNodeIds.length && componentNodeIds.every(id => nodeById.get(id).edges.filter(edgeId => componentEdgeIds.has(edgeId)).length === 2);
      components.push({
        id:components.length + 1,
        closed,
        nodeIds:componentNodeIds,
        edgeIds:[...componentEdgeIds],
        structureIds:componentEdges.map(edge => edge.structureId),
        segments:componentEdges.length,
        gates:componentEdges.filter(edge => edge.type === 'gatehouse').length,
        length:componentEdges.reduce((sum, edge) => sum + edge.length, 0),
      });
    }
    return {
      completedOnly,
      nodes:nodes.map(node => ({ id:node.id, x:node.x, y:node.y, degree:node.edges.length })),
      edges,
      components,
      closed:components.filter(component => component.closed),
      closedCount:components.filter(component => component.closed).length,
      totalLinearSegments:edges.length,
    };
  }

  settlement.placeBlueprint = strictPlaceBlueprint;

  settlement.getState = () => {
    const state = previousGetState();
    const blueprints = derivePerimeters({ completedOnly:false });
    const completed = derivePerimeters({ completedOnly:true });
    if (state.settlement) {
      state.settlement.derivedPerimeters = completed.closedCount;
      state.settlement.derivedBlueprintPerimeters = blueprints.closedCount;
      state.settlement.enclosedByCompletedFortifications = completed.closedCount > 0;
    }
    return state;
  };

  settlement.getStats = () => {
    const completed = derivePerimeters({ completedOnly:true });
    return {
      ...previousGetStats(),
      v69CastlePerimeters:true,
      fullFootprintTerrainValidation:true,
      footprintSampleCount:9,
      shorelineFootprintRejection:true,
      slopeFootprintRejection:true,
      orientedFootprintOverlapValidation:true,
      endpointSnapping:true,
      straightAndCornerSnapping:true,
      closedPerimetersDerivedFromWallGraph:true,
      noStoredCastleMembershipId:true,
      noHardWallSegmentCap:true,
      strictPlacements,
      rejectedFootprints,
      shorelineRejections,
      slopeRejections,
      overlapRejections,
      snappedPlacements,
      straightSnaps,
      cornerSnaps,
      closedCompletedPerimeters:completed.closedCount,
      chainMode,
    };
  };

  function notify(message) {
    const notice = document.querySelector('#runevaleSettlementHudV68 .runevale-v68-notice');
    if (notice) notice.textContent = message;
  }

  function interceptPlacement(event, source) {
    const type = settlement.getSelectedBuilding?.() || 'palisade';
    const result = strictPlaceBlueprint(type, 10);
    if (result.ok) {
      const suffix = result.snapped ? ` · snapped ${result.snap?.kind || 'wall'}` : '';
      notify(`${catalog[type]?.label || type} blueprint placed${suffix}`);
    } else {
      notify(result.reason || `Placement blocked by v69 ${source}.`);
    }
    return result;
  }

  window.addEventListener('keydown', event => {
    if (!surface.isActive?.() || event.code !== 'KeyP' || event.repeat) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    interceptPlacement(event, 'keyboard');
  }, { capture:true, passive:false });

  document.addEventListener('click', event => {
    if (!surface.isActive?.() || !event.target?.closest?.('#runevaleSettlementHudV68 .runevale-v68-place')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    interceptPlacement(event, 'build-panel');
  }, { capture:true, passive:false });

  const api = {
    installed:true,
    version:VERSION,
    validateAt(type, x, y, placementYaw = 0) {
      return validateCandidate({ type, x:wrap(x, world.width), y:clamp(y, 0.02, world.height - 0.02), rotation:normAngle(placementYaw) });
    },
    placeAt:strictPlaceAt,
    placeFromPlayer:strictPlaceBlueprint,
    getPerimeters:options => derivePerimeters(options || {}),
    getEndpoints:() => copy(endpointRecords()),
    getLastValidation:() => copy(lastValidation),
    getLastPlacement:() => copy(lastPlacement),
    setChainMode(value) { chainMode = Boolean(value); return chainMode; },
    getStats:() => ({
      installed:true,
      version:VERSION,
      fullFootprintTerrainValidation:true,
      footprintSampleCount:9,
      endpointSnapping:true,
      snapRadius:SNAP_RADIUS,
      nodeMergeTolerance:NODE_MERGE_TOLERANCE,
      strictPlacements,
      rejectedFootprints,
      shorelineRejections,
      slopeRejections,
      overlapRejections,
      snappedPlacements,
      straightSnaps,
      cornerSnaps,
      derivedPerimeterReads,
      chainMode,
      noHardWallSegmentCap:true,
      noHardBuildingCap:true,
      noHardPopulationCap:true,
      noHardDisplayCap:true,
    }),
  };

  window.realitySandboxRunevaleCastlePerimetersV69 = api;
  document.documentElement.dataset.runevaleCastlePerimetersV69 = 'footprint-snap-derived-enclosures';
}

waitForRuntime().then(state => {
  if (!state) {
    document.documentElement.dataset.runevaleCastlePerimetersV69 = 'unavailable';
    return;
  }
  install(state);
});
