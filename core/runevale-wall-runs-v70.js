const VERSION = 'v70a-quantized-wall-runs';
const SEGMENT_LENGTH = 8;
const CURSOR_DISTANCE = 10;
const START_SNAP_RADIUS = 3.25;

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number(v) || 0));
const wrap = (value, max) => ((value % max) + max) % max;

async function waitForRuntime() {
  for (let attempt = 0; attempt < 400; attempt++) {
    const v69 = window.realitySandboxRunevaleCastlePerimetersV69;
    const settlement = window.realitySandboxRunevaleSettlementV68;
    const surface = window.realitySandboxSurfaceMode;
    const world = window.realitySandboxPlanet?.world;
    if (v69?.installed && settlement?.installed && surface?.getPlayer && world?.width && world?.height) return { v69, settlement, surface, world };
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  return null;
}

function install({ v69, settlement, surface, world }) {
  if (window.realitySandboxRunevaleWallRunsV70?.installed) return;

  let anchor = null;
  let runsPlaced = 0;
  let segmentsPlaced = 0;
  let requestedLengthTotal = 0;
  let constructedLengthTotal = 0;
  let startSnaps = 0;
  let rejectedRuns = 0;
  let lastRun = null;

  function shortestWrappedDelta(value, origin, size) {
    let delta = value - origin;
    if (delta > size * 0.5) delta -= size;
    else if (delta < -size * 0.5) delta += size;
    return delta;
  }

  function distance(a, b) {
    return Math.hypot(shortestWrappedDelta(b.x, a.x, world.width), b.y - a.y);
  }

  function cursorPoint() {
    const player = surface.getPlayer();
    return {
      x:wrap(player.x + Math.cos(player.yaw) * CURSOR_DISTANCE, world.width),
      y:clamp(player.y + Math.sin(player.yaw) * CURSOR_DISTANCE, 0.02, world.height - 0.02),
    };
  }

  function nearestEndpoint(point) {
    let best = null;
    for (const endpoint of v69.getEndpoints?.() || []) {
      const d = distance(point, endpoint);
      if (d <= START_SNAP_RADIUS && (!best || d < best.distance)) best = { ...endpoint, distance:d };
    }
    return best;
  }

  function snapStart(point) {
    const endpoint = nearestEndpoint(point);
    if (!endpoint) return { point:{ ...point }, snapped:false, endpoint:null };
    return { point:{ x:endpoint.x, y:endpoint.y }, snapped:true, endpoint };
  }

  function planRun(start, end, type = 'palisade') {
    const snappedStart = snapStart(start);
    const dx = shortestWrappedDelta(end.x, snappedStart.point.x, world.width);
    const dy = end.y - snappedStart.point.y;
    const requestedLength = Math.hypot(dx, dy);
    if (requestedLength < SEGMENT_LENGTH * 0.45) return { ok:false, reason:'Wall run is too short.', requestedLength, snappedStart };
    const segments = Math.max(1, Math.round(requestedLength / SEGMENT_LENGTH));
    const modelAngle = Math.atan2(dy, dx);
    const placementYaw = modelAngle - Math.PI * 0.5;
    const axisX = Math.cos(modelAngle);
    const axisY = Math.sin(modelAngle);
    const items = [];
    for (let i = 0; i < segments; i++) {
      const centerDistance = (i + 0.5) * SEGMENT_LENGTH;
      items.push({
        index:i,
        type,
        x:wrap(snappedStart.point.x + axisX * centerDistance, world.width),
        y:clamp(snappedStart.point.y + axisY * centerDistance, 0.02, world.height - 0.02),
        placementYaw,
      });
    }
    const constructedLength = segments * SEGMENT_LENGTH;
    const constructedEnd = {
      x:wrap(snappedStart.point.x + axisX * constructedLength, world.width),
      y:clamp(snappedStart.point.y + axisY * constructedLength, 0.02, world.height - 0.02),
    };
    return {
      ok:true,
      type,
      start:{ ...snappedStart.point },
      requestedEnd:{ ...end },
      constructedEnd,
      requestedLength,
      constructedLength,
      endpointError:distance(constructedEnd, end),
      modelAngle,
      placementYaw,
      segmentLength:SEGMENT_LENGTH,
      segments,
      items,
      snappedStart:snappedStart.snapped,
      snappedEndpoint:snappedStart.endpoint,
    };
  }

  function validatePlan(plan) {
    if (!plan?.ok) return plan;
    const validations = [];
    for (const item of plan.items) {
      const validation = v69.validateAt(item.type, item.x, item.y, item.placementYaw);
      validations.push(validation);
      if (!validation.ok) return { ok:false, reason:`Wall run blocked at segment ${item.index + 1}: ${validation.reason}`, plan, validations, failedIndex:item.index };
    }
    return { ok:true, plan, validations };
  }

  function placeWallRun(start, end, type = 'palisade') {
    const plan = planRun(start, end, type);
    const checked = validatePlan(plan);
    if (!checked.ok) {
      rejectedRuns++;
      lastRun = checked;
      return checked;
    }

    const placed = [];
    for (const item of plan.items) {
      const result = v69.placeAt(item.type, item.x, item.y, item.placementYaw, { snap:false });
      if (!result.ok) {
        rejectedRuns++;
        const failure = { ok:false, reason:`Wall run placement failed at segment ${item.index + 1}: ${result.reason}`, plan, placed, failed:item, result };
        lastRun = failure;
        return failure;
      }
      placed.push(result);
    }

    runsPlaced++;
    segmentsPlaced += placed.length;
    requestedLengthTotal += plan.requestedLength;
    constructedLengthTotal += plan.constructedLength;
    if (plan.snappedStart) startSnaps++;
    const result = { ok:true, plan, placed, runNumber:runsPlaced };
    lastRun = result;
    return result;
  }

  function startRun(point = cursorPoint()) {
    const snapped = snapStart(point);
    anchor = {
      x:snapped.point.x,
      y:snapped.point.y,
      snapped:snapped.snapped,
      endpoint:snapped.endpoint,
      createdAt:performance.now(),
    };
    notify(snapped.snapped ? 'Wall run start snapped to fortification endpoint. Move/turn, then press R again.' : 'Wall run start marked. Move/turn, then press R again.');
    return { ok:true, anchor:{ ...anchor } };
  }

  function finishRun(point = cursorPoint(), type = 'palisade') {
    if (!anchor) return startRun(point);
    const start = { x:anchor.x, y:anchor.y };
    anchor = null;
    const result = placeWallRun(start, point, type);
    if (result.ok) notify(`${result.plan.segments} wall segments queued · ${result.plan.constructedLength.toFixed(0)} units · ${result.plan.segments * 8} wood`);
    else notify(result.reason || 'Wall run rejected.');
    return result;
  }

  function cancelRun() {
    anchor = null;
    notify('Wall run cancelled.');
  }

  function notify(message) {
    const notice = document.querySelector('#runevaleSettlementHudV68 .runevale-v68-notice');
    if (notice) notice.textContent = message;
  }

  function installHudButton() {
    const panel = document.querySelector('#runevaleSettlementHudV68 > div:nth-child(2)');
    if (!panel || panel.querySelector('.runevale-v70-wall-run')) return false;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'runevale-v70-wall-run';
    button.textContent = 'Wall run start/end [R]';
    Object.assign(button.style, {
      width:'100%', marginTop:'6px', minHeight:'36px', padding:'7px 9px',
      border:'1px solid rgba(220,233,221,.25)', borderRadius:'8px',
      background:'rgba(23,38,31,.92)', color:'#eef6ee',
      font:'600 10px/1.1 ui-monospace, SFMono-Regular, Menlo, monospace', cursor:'pointer', touchAction:'manipulation',
    });
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      finishRun(cursorPoint(), 'palisade');
    });
    panel.appendChild(button);
    return true;
  }

  // v68 can rebuild its HUD as Surface presentation state changes. A one-shot
  // timer loses this extension control after that rebuild, so keep the button
  // invariant attached to whichever current HUD panel owns the build controls.
  installHudButton();
  const hudObserver = new MutationObserver(() => installHudButton());
  hudObserver.observe(document.documentElement, { childList:true, subtree:true });

  window.addEventListener('keydown', event => {
    if (!surface.isActive?.() || event.repeat) return;
    if (event.code === 'KeyR') {
      event.preventDefault();
      event.stopImmediatePropagation();
      finishRun(cursorPoint(), 'palisade');
    } else if (event.code === 'Escape' && anchor) {
      cancelRun();
    }
  }, { capture:true, passive:false });

  const previousGetStats = settlement.getStats.bind(settlement);
  settlement.getStats = () => ({
    ...previousGetStats(),
    v70WallRuns:true,
    wallRunsUseV69StrictFootprints:true,
    wallRunsUseV68PhysicalConstruction:true,
    wallRunSegmentLength:SEGMENT_LENGTH,
    wallRunMaterialCostPerSegment:8,
    wallRunWorkPerSegment:8,
    noHardWallRunLengthCap:true,
    noHardWallRunSegmentCap:true,
    runsPlaced,
    segmentsPlaced,
  });

  const api = {
    installed:true,
    version:VERSION,
    segmentLength:SEGMENT_LENGTH,
    planRun,
    validatePlan,
    placeWallRun,
    startRun,
    finishRun,
    cancelRun,
    getAnchor:() => anchor ? { ...anchor } : null,
    getLastRun:() => lastRun ? JSON.parse(JSON.stringify(lastRun)) : null,
    getStats:() => ({
      installed:true,
      version:VERSION,
      segmentLength:SEGMENT_LENGTH,
      startSnapRadius:START_SNAP_RADIUS,
      runsPlaced,
      segmentsPlaced,
      requestedLengthTotal,
      constructedLengthTotal,
      startSnaps,
      rejectedRuns,
      anchorActive:Boolean(anchor),
      usesV69FullFootprintValidation:true,
      usesV68PhysicalMaterialsAndWorkers:true,
      materialCostPerConstructedUnit:1,
      workPerConstructedUnit:1,
      quantizationErrorBound:SEGMENT_LENGTH * 0.5,
      noHardWallRunLengthCap:true,
      noHardWallRunSegmentCap:true,
      noHardBuildingCap:true,
      noHardPopulationCap:true,
      noHardDisplayCap:true,
    }),
  };

  window.realitySandboxRunevaleWallRunsV70 = api;
  document.documentElement.dataset.runevaleWallRunsV70 = 'quantized-physical-wall-runs';
}

waitForRuntime().then(state => {
  if (!state) {
    document.documentElement.dataset.runevaleWallRunsV70 = 'unavailable';
    return;
  }
  install(state);
});
