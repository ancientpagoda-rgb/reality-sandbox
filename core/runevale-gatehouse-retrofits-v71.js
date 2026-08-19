const VERSION = 'v71a-physical-gatehouse-retrofits';
const GATEHOUSE_SLOPE_LIMIT = 0.095;
const GATEHOUSE_DEPTH = 4.4;
const TARGET_DISTANCE = 36;
const TARGET_FORWARD_DOT = 0.22;

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number(v) || 0));
const wrap = (value, max) => ((value % max) + max) % max;

async function waitForRuntime() {
  for (let attempt = 0; attempt < 400; attempt++) {
    const settlement = window.realitySandboxRunevaleSettlementV68;
    const orientation = window.realitySandboxRunevaleBuildOrientationV68b;
    const v69 = window.realitySandboxRunevaleCastlePerimetersV69;
    const surface = window.realitySandboxSurfaceMode;
    const planet = window.realitySandboxPlanet;
    if (
      settlement?.installed && typeof settlement.retrofitStructure === 'function' && orientation?.installed &&
      v69?.installed && surface?.getPlayer && planet?.living?.sampleDynamicPlanet && planet?.waterCycle?.sample
    ) return { settlement, v69, surface, planet };
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  return null;
}

function install({ settlement, v69, surface, planet }) {
  if (window.realitySandboxRunevaleGatehouseRetrofitsV71?.installed) return;

  const { world, living, waterCycle } = planet;
  const gateSpec = settlement.catalog?.gatehouse;
  const palisadeSpec = settlement.catalog?.palisade;
  let retrofitRequests = 0;
  let retrofitAccepted = 0;
  let footprintRejections = 0;
  let targetMisses = 0;
  let lastRetrofit = null;
  let lastValidation = null;

  function shortestWrappedDelta(value, origin, size) {
    let delta = value - origin;
    if (delta > size * 0.5) delta -= size;
    else if (delta < -size * 0.5) delta += size;
    return delta;
  }

  function distance(a, b) {
    return Math.hypot(shortestWrappedDelta(b.x, a.x, world.width), b.y - a.y);
  }

  function publicPlacementYaw(structure) {
    if (Number.isFinite(structure.modelRotation)) return Number(structure.modelRotation);
    return (Number(structure.rotation) || 0) - Math.PI * 0.5;
  }

  function modelAngle(structure) {
    return publicPlacementYaw(structure) + Math.PI * 0.5;
  }

  function sampleFootprint(structure) {
    const angle = modelAngle(structure);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const width = Number(gateSpec?.width) || 8.5;
    const depth = GATEHOUSE_DEPTH;
    const samples = [];
    for (const u of [-width * 0.5, 0, width * 0.5]) {
      for (const v of [-depth * 0.5, 0, depth * 0.5]) {
        const x = wrap(structure.x + c * u - s * v, world.width);
        const y = clamp(structure.y + s * u + c * v, 0.02, world.height - 0.02);
        const terrain = living.sampleDynamicPlanet(x, y, 'v71-gatehouse-exact');
        const water = waterCycle.sample(x, y, 'v71-gatehouse-exact');
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

  function validateGatehouseFootprint(structureId) {
    const state = settlement.getState();
    const structure = state.structures.find(item => item.id === Number(structureId));
    if (!structure) return { ok:false, reason:'Wall segment not found.', samples:[] };
    if (structure.type !== 'palisade') return { ok:false, reason:'Only palisades can be retrofitted into gatehouses.', samples:[] };
    if (structure.status !== 'complete') return { ok:false, reason:'Finish the palisade before cutting in a gatehouse.', samples:[] };
    const samples = sampleFootprint(structure);
    const dry = samples.every(sample => sample.land && sample.lake <= 0.45);
    const elevations = samples.map(sample => sample.elevation);
    const elevationRange = Math.max(...elevations) - Math.min(...elevations);
    if (!dry) {
      const result = { ok:false, reason:'The wider gatehouse footprint would cross water or non-buildable ground.', samples, elevationRange, slopeLimit:GATEHOUSE_SLOPE_LIMIT, structureId:structure.id };
      lastValidation = result;
      return result;
    }
    if (elevationRange > GATEHOUSE_SLOPE_LIMIT) {
      const result = { ok:false, reason:`The gatehouse footprint is too steep (${elevationRange.toFixed(3)} > ${GATEHOUSE_SLOPE_LIMIT.toFixed(3)}).`, samples, elevationRange, slopeLimit:GATEHOUSE_SLOPE_LIMIT, structureId:structure.id };
      lastValidation = result;
      return result;
    }
    const result = { ok:true, samples, elevationRange, slopeLimit:GATEHOUSE_SLOPE_LIMIT, structureId:structure.id, placementYaw:publicPlacementYaw(structure) };
    lastValidation = result;
    return result;
  }

  function nearestPalisadeInFront() {
    const player = surface.getPlayer();
    const state = settlement.getState();
    const fx = Math.cos(player.yaw || 0);
    const fy = Math.sin(player.yaw || 0);
    let best = null;
    for (const structure of state.structures) {
      if (structure.type !== 'palisade' || structure.status !== 'complete') continue;
      const dx = shortestWrappedDelta(structure.x, player.x, world.width);
      const dy = structure.y - player.y;
      const d = Math.hypot(dx, dy);
      if (d > TARGET_DISTANCE || d < 0.01) continue;
      const forwardDot = (dx / d) * fx + (dy / d) * fy;
      if (forwardDot < TARGET_FORWARD_DOT) continue;
      const score = d * (1.15 - Math.min(1, forwardDot) * 0.35);
      if (!best || score < best.score) best = { structure, distance:d, forwardDot, score };
    }
    return best ? { ...best, structure:{ ...best.structure } } : null;
  }

  function retrofitGatehouse(structureId) {
    retrofitRequests++;
    const validation = validateGatehouseFootprint(structureId);
    if (!validation.ok) {
      footprintRejections++;
      const result = { ...validation, requestedTarget:'gatehouse' };
      lastRetrofit = result;
      return result;
    }

    const beforeState = settlement.getState();
    const before = beforeState.structures.find(item => item.id === Number(structureId));
    const stockBefore = beforeState.settlement ? { ...beforeState.settlement.stockpile } : null;
    const completedGraphBefore = v69.getPerimeters({ completedOnly:true });
    const allGraphBefore = v69.getPerimeters({ completedOnly:false });
    const result = settlement.retrofitStructure(structureId, 'gatehouse');
    if (!result?.ok) {
      lastRetrofit = { ...result, validation, before, stockBefore };
      return lastRetrofit;
    }

    retrofitAccepted++;
    const afterState = settlement.getState();
    const after = afterState.structures.find(item => item.id === Number(structureId));
    const completedGraphAfter = v69.getPerimeters({ completedOnly:true });
    const allGraphAfter = v69.getPerimeters({ completedOnly:false });
    const enriched = {
      ok:true,
      structureId:Number(structureId),
      fromType:'palisade',
      toType:'gatehouse',
      validation,
      before,
      after,
      stockBefore,
      retrofit:result.retrofit,
      completedGraphBefore,
      allGraphBefore,
      completedGraphAfter,
      allGraphAfter,
    };
    lastRetrofit = enriched;
    return enriched;
  }

  function retrofitNearestGatehouse() {
    const target = nearestPalisadeInFront();
    if (!target) {
      targetMisses++;
      const result = { ok:false, reason:'No completed palisade is in front of you within gatehouse range.' };
      lastRetrofit = result;
      notify(result.reason);
      return result;
    }
    const result = retrofitGatehouse(target.structure.id);
    notify(result.ok ? `Gatehouse retrofit started · +${result.retrofit.deltaRequired.wood} wood · +${result.retrofit.deltaRequired.stone} stone · +${result.retrofit.deltaRequired.work} work` : result.reason);
    return result;
  }

  function notify(message) {
    const notice = document.querySelector('#runevaleSettlementHudV68 .runevale-v68-notice');
    if (notice) notice.textContent = message;
  }

  function installHudButton() {
    const panel = document.querySelector('#runevaleSettlementHudV68 > div:nth-child(2)');
    if (!panel || panel.querySelector('.runevale-v71-gatehouse-retrofit')) return false;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'runevale-v71-gatehouse-retrofit';
    button.textContent = 'Upgrade wall → gatehouse [U]';
    Object.assign(button.style, {
      width:'100%', marginTop:'6px', minHeight:'36px', padding:'7px 9px',
      border:'1px solid rgba(220,233,221,.25)', borderRadius:'8px',
      background:'rgba(47,38,27,.94)', color:'#f3eee3',
      font:'600 10px/1.1 ui-monospace, SFMono-Regular, Menlo, monospace', cursor:'pointer', touchAction:'manipulation',
    });
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      retrofitNearestGatehouse();
    });
    panel.appendChild(button);
    return true;
  }

  // v68 can replace the build HUD during presentation/reload lifecycle changes.
  // Keep this extension control attached to the current HUD instead of stopping
  // after the first successful insertion and losing it on a later rebuild.
  installHudButton();
  const hudObserver = new MutationObserver(() => installHudButton());
  hudObserver.observe(document.documentElement, { childList:true, subtree:true });

  window.addEventListener('keydown', event => {
    if (!surface.isActive?.() || event.repeat || event.code !== 'KeyU') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    retrofitNearestGatehouse();
  }, { capture:true, passive:false });

  const previousGetStats = settlement.getStats.bind(settlement);
  settlement.getStats = () => ({
    ...previousGetStats(),
    v71GatehouseRetrofits:true,
    retrofitsPreserveEmbodiedMaterialsAndWork:true,
    gatehouseRetrofitDeltaWood:(gateSpec?.wood || 12) - (palisadeSpec?.wood || 8),
    gatehouseRetrofitDeltaStone:(gateSpec?.stone || 8) - (palisadeSpec?.stone || 0),
    gatehouseRetrofitDeltaWork:(gateSpec?.work || 18) - (palisadeSpec?.work || 8),
    retrofitUsesExistingV68Workers:true,
    retrofitKeepsSameStructureId:true,
    retrofitTemporarilyOpensCompletedPerimeter:true,
    retrofitRestoresGateEdgeOnCompletion:true,
    noFreeMaterialReplacement:true,
    retrofitRequests,
    retrofitAccepted,
  });

  const api = {
    installed:true,
    version:VERSION,
    validateGatehouseFootprint,
    nearestPalisadeInFront,
    retrofitGatehouse,
    retrofitNearestGatehouse,
    getLastRetrofit:() => lastRetrofit ? JSON.parse(JSON.stringify(lastRetrofit)) : null,
    getLastValidation:() => lastValidation ? JSON.parse(JSON.stringify(lastValidation)) : null,
    getStats:() => ({
      installed:true,
      version:VERSION,
      targetType:'gatehouse',
      gatehouseSlopeLimit:GATEHOUSE_SLOPE_LIMIT,
      footprintSampleCount:9,
      targetDistance:TARGET_DISTANCE,
      targetForwardDot:TARGET_FORWARD_DOT,
      retrofitRequests,
      retrofitAccepted,
      footprintRejections,
      targetMisses,
      deltaRequired:{
        wood:(gateSpec?.wood || 12) - (palisadeSpec?.wood || 8),
        stone:(gateSpec?.stone || 8) - (palisadeSpec?.stone || 0),
        work:(gateSpec?.work || 18) - (palisadeSpec?.work || 8),
      },
      preservesEmbodiedMaterialsAndWork:true,
      sameStructureId:true,
      usesV68Workers:true,
      usesV68Stockpile:true,
      usesV69DerivedPerimeterGraph:true,
      noFreeReplacement:true,
      noHardRetrofitCap:true,
      noHardBuildingCap:true,
      noHardPopulationCap:true,
      noHardDisplayCap:true,
    }),
  };

  window.realitySandboxRunevaleGatehouseRetrofitsV71 = api;
  document.documentElement.dataset.runevaleGatehouseRetrofitsV71 = 'physical-delta-gatehouse-upgrades';
}

waitForRuntime().then(state => {
  if (!state) {
    document.documentElement.dataset.runevaleGatehouseRetrofitsV71 = 'unavailable';
    return;
  }
  install(state);
});
