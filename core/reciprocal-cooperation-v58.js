const STEP_SECONDS = 0.9;
const CELL_SIZE = 112;
const MAX_PARTNERS = 8;
const MAX_PUBLIC_REQUEST_EVENTS = 32;
const TRANSFER_EFFICIENCY = 0.86;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number(v) || 0));
const clampSigned = v => Math.max(-1, Math.min(1, Number(v) || 0));
const wrap = (v, max) => ((v % max) + max) % max;

async function waitForRuntime() {
  while (true) {
    const social = window.realitySandboxSocialModelsV57;
    const origin = window.realitySandboxOriginMotileLifeV47;
    const planet = window.realitySandboxPlanet;
    const modules = window.realitySandboxModules;
    const c = planet?.world?.ecs?.components;
    if (
      social?.installed && origin?.installed && modules?.step &&
      c?.motile instanceof Map && c?.position instanceof Map
    ) return { social, planet, modules };
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ social, planet, modules }) {
  if (window.realitySandboxReciprocalCooperationV58?.installed) return;

  const { world } = planet;
  const { motile, position } = world.ecs.components;
  const cols = Math.max(1, Math.ceil(world.width / CELL_SIZE));
  const rows = Math.max(1, Math.ceil(world.height / CELL_SIZE));
  let accumulator = 0;
  let stepCount = 0;
  let aidRequestScoreModifier = null;
  let publicRequestSerial = 0;
  const publicRequestEvents = [];

  const stats = {
    steps:0,
    solicitations:0,
    heardSolicitations:0,
    aidChoices:0,
    aidEvents:0,
    refusedRequests:0,
    reciprocalChoices:0,
    unfamiliarAidChoices:0,
    energyDebited:0,
    energyReceived:0,
    metabolicAidCost:0,
    activePartnerLedgers:0,
    cooperatingOrganisms:0,
    cooperativeLineages:0,
    meanHelpingTendency:0,
    meanReciprocityLearning:0,
  };

  function dxTo(targetX, originX) {
    let d = targetX - originX;
    if (d > world.width * 0.5) d -= world.width;
    else if (d < -world.width * 0.5) d += world.width;
    return d;
  }

  function distance(a, b) {
    return Math.hypot(dxTo(b.x, a.x), b.y - a.y);
  }

  function keyFor(x, y) {
    const cx = Math.floor(wrap(x, world.width) / CELL_SIZE) % cols;
    const cy = Math.max(0, Math.min(rows - 1, Math.floor(Math.max(0, Math.min(world.height - 0.0001, y)) / CELL_SIZE)));
    return `${cx}:${cy}`;
  }

  function neighborKeys(x, y, rings = 1) {
    const cx = Math.floor(wrap(x, world.width) / CELL_SIZE) % cols;
    const cy = Math.max(0, Math.min(rows - 1, Math.floor(Math.max(0, Math.min(world.height - 0.0001, y)) / CELL_SIZE)));
    const keys = [];
    for (let oy = -rings; oy <= rings; oy++) {
      for (let ox = -rings; ox <= rings; ox++) {
        keys.push(`${(cx + ox + cols) % cols}:${Math.max(0, Math.min(rows - 1, cy + oy))}`);
      }
    }
    return keys;
  }

  function phenotype(g = {}) {
    const brain = clamp(g.brainSpeed);
    const sociality = clamp(g.sociality);
    const sense = clamp(g.sense);
    const metabolism = clamp(g.metabolism);
    return {
      helpingTendency:clamp(0.04 + sociality * 0.46 + brain * 0.30 + sense * 0.12 - metabolism * 0.06),
      reciprocityLearning:clamp(0.06 + brain * 0.48 + sociality * 0.34 + sense * 0.10),
      solicitationControl:clamp(0.08 + brain * 0.28 + sociality * 0.34 + sense * 0.18),
      aidRadius:52 + sense * 118 + sociality * 84,
      requestRadius:48 + sense * 126 + sociality * 88,
      requestThreshold:0.64 - sociality * 0.12 - brain * 0.06,
      donorReserve:0.82 + metabolism * 0.10,
    };
  }

  function newLedger(partnerId) {
    return {
      partnerId,
      given:0,
      received:0,
      giftsGiven:0,
      giftsReceived:0,
      reciprocity:0,
      familiarity:0,
      lastInteractionStep:stepCount,
    };
  }

  function ensureState(organism, ph) {
    if (!organism.bioV58) {
      organism.bioV58 = {
        helpingTendency:ph.helpingTendency,
        reciprocityLearning:ph.reciprocityLearning,
        solicitationControl:ph.solicitationControl,
        ledgers:{},
        lastSolicitation:null,
        lastAidChoice:null,
        lastAidReceived:null,
      };
    }
    organism.bioV58.helpingTendency = ph.helpingTendency;
    organism.bioV58.reciprocityLearning = ph.reciprocityLearning;
    organism.bioV58.solicitationControl = ph.solicitationControl;
    organism.bioV58.ledgers ||= {};
    return organism.bioV58;
  }

  function retentionScore(ledger) {
    const volume = clamp((ledger.given + ledger.received) / 0.8);
    const interactions = clamp((ledger.giftsGiven + ledger.giftsReceived) / 5);
    const recencyPenalty = clamp((stepCount - ledger.lastInteractionStep) / 180) * 0.10;
    return ledger.familiarity * 0.40 + Math.abs(ledger.reciprocity) * 0.22 + volume * 0.18 + interactions * 0.20 - recencyPenalty;
  }

  function ensureLedger(state, partnerId) {
    const key = String(partnerId);
    if (state.ledgers[key]) return state.ledgers[key];
    const keys = Object.keys(state.ledgers);
    if (keys.length >= MAX_PARTNERS) {
      let weakest = null;
      let weakestScore = Infinity;
      for (const existing of keys) {
        const score = retentionScore(state.ledgers[existing]);
        if (score < weakestScore) {
          weakestScore = score;
          weakest = existing;
        }
      }
      if (weakest != null) delete state.ledgers[weakest];
    }
    return state.ledgers[key] = newLedger(partnerId);
  }

  function refreshReciprocity(ledger, learning) {
    const total = ledger.given + ledger.received;
    if (total <= 0.0001) {
      ledger.reciprocity = 0;
      return;
    }
    const balance = (ledger.received - ledger.given) / Math.max(0.08, total);
    const interactionBalance = (ledger.giftsReceived - ledger.giftsGiven) / Math.max(1, ledger.giftsReceived + ledger.giftsGiven);
    const target = clampSigned(balance * 0.68 + interactionBalance * 0.32);
    ledger.reciprocity = clampSigned(
      ledger.reciprocity * (0.78 + (1 - learning) * 0.08) +
      target * (0.14 + learning * 0.08)
    );
  }

  function buildGrid() {
    const grid = new Map();
    for (const [id] of motile.entries()) {
      const p = position.get(id);
      if (!p) continue;
      const key = keyFor(p.x, p.y);
      let bucket = grid.get(key);
      if (!bucket) grid.set(key, bucket = []);
      bucket.push(id);
    }
    return grid;
  }

  function recordPublicRequest(request) {
    publicRequestEvents.push({
      eventId:++publicRequestSerial,
      requesterId:request.requesterId,
      lineageId:request.lineageId,
      x:request.x,
      y:request.y,
      step:request.step,
    });
    if (publicRequestEvents.length > MAX_PUBLIC_REQUEST_EVENTS) publicRequestEvents.shift();
  }

  function makeSolicitation(id, organism, p, ph, state) {
    if (organism.state === 'sleeping' || ph.solicitationControl < 0.24) return null;
    const ownEnergy = Number(organism.energy) || 0;
    if (ownEnergy >= ph.requestThreshold) return null;
    const deficit = clamp((ph.requestThreshold - ownEnergy) / Math.max(0.2, ph.requestThreshold));
    if (deficit < 0.08) return null;
    const urgency = clamp(0.20 + deficit * 0.70 + ph.solicitationControl * 0.10);
    const request = {
      requesterId:id,
      lineageId:organism.lineageId,
      x:p.x,
      y:p.y,
      radius:ph.requestRadius,
      urgency,
      strength:clamp(0.28 + urgency * 0.46 + ph.solicitationControl * 0.20),
      step:stepCount,
    };
    state.lastSolicitation = { urgency, strength:request.strength, step:stepCount };
    stats.solicitations++;
    recordPublicRequest(request);
    return request;
  }

  function socialEvidence(helperId, requesterId) {
    const model = social.getSocialModel?.(helperId)?.models?.[String(requesterId)] || null;
    if (!model) return { known:false, trust:0, responsiveness:0, familiarity:0 };
    return {
      known:true,
      trust:clampSigned(model.trust),
      responsiveness:clampSigned(model.responsiveness),
      familiarity:clamp(model.familiarity),
    };
  }

  function applyAidRequestScoreModifier(context) {
    if (typeof aidRequestScoreModifier !== 'function') return context.baseScore;
    try {
      const modified = Number(aidRequestScoreModifier({ ...context }));
      return Number.isFinite(modified) ? modified : context.baseScore;
    } catch {
      return context.baseScore;
    }
  }

  function requestScore(helperId, helper, helperState, ph, p, request) {
    const rp = position.get(request.requesterId);
    const requester = motile.get(request.requesterId);
    if (!rp || !requester || requester.lineageId !== helper.lineageId) return null;
    const d = distance(p, rp);
    const radius = Math.min(ph.aidRadius, request.radius);
    if (d > radius) return null;
    stats.heardSolicitations++;

    const ledger = helperState.ledgers[String(request.requesterId)] || null;
    const socialModel = socialEvidence(helperId, request.requesterId);
    const distanceTerm = 1 - clamp(d / Math.max(1, radius));
    const reciprocalHistory = ledger ? clampSigned(ledger.reciprocity + (ledger.received > 0 ? 0.28 : 0)) : 0;
    const evidenceWeight = socialModel.known ? 1 : 0.42;
    const baseScore =
      ph.helpingTendency * 0.28 +
      request.urgency * 0.20 +
      distanceTerm * 0.14 +
      socialModel.trust * 0.12 * evidenceWeight +
      socialModel.responsiveness * 0.08 * evidenceWeight +
      socialModel.familiarity * 0.06 * evidenceWeight +
      reciprocalHistory * (0.16 + ph.reciprocityLearning * 0.10);
    const score = applyAidRequestScoreModifier({
      helperId,
      requesterId:request.requesterId,
      baseScore,
      distance:d,
      radius,
      directReciprocity:reciprocalHistory,
      directSocialKnown:socialModel.known,
    });
    return {
      request,
      d,
      score,
      baseScore,
      externalScoreAdjustment:score - baseScore,
      ledger,
      socialModel,
    };
  }

  function chooseRequest(helperId, helper, state, ph, p, grid, requestById) {
    if (helper.state === 'sleeping' || ph.helpingTendency < 0.24) return null;
    const ownEnergy = Number(helper.energy) || 0;
    if (ownEnergy <= ph.donorReserve + 0.06) return null;

    const rings = Math.max(1, Math.min(3, Math.ceil(ph.aidRadius / CELL_SIZE)));
    let best = null;
    for (const key of neighborKeys(p.x, p.y, rings)) {
      for (const otherId of grid.get(key) || []) {
        if (otherId === helperId) continue;
        const request = requestById.get(otherId);
        if (!request) continue;
        const candidate = requestScore(helperId, helper, state, ph, p, request);
        if (!candidate) continue;
        if (!best || candidate.score > best.score) best = candidate;
      }
    }
    return best;
  }

  function performAid(helperId, helper, helperState, ph, candidate) {
    const requesterId = candidate.request.requesterId;
    const receiver = motile.get(requesterId);
    if (!receiver) return false;

    const threshold = 0.40 + (1 - ph.helpingTendency) * 0.08;
    helperState.lastAidChoice = {
      requesterId,
      score:candidate.score,
      baseScore:candidate.baseScore,
      externalScoreAdjustment:candidate.externalScoreAdjustment,
      threshold,
      reciprocal:Boolean(candidate.ledger?.received > 0),
      emitted:candidate.score >= threshold,
      step:stepCount,
    };
    stats.aidChoices++;

    if (candidate.score < threshold) {
      stats.refusedRequests++;
      return false;
    }

    const available = Math.max(0, (Number(helper.energy) || 0) - ph.donorReserve);
    if (available <= 0.015) {
      stats.refusedRequests++;
      return false;
    }

    const debit = Math.min(
      available,
      0.055 + ph.helpingTendency * 0.060 + candidate.request.urgency * 0.035
    );
    if (debit <= 0.01) return false;
    const received = debit * TRANSFER_EFFICIENCY;
    const cost = debit - received;

    helper.energy = Math.max(0, helper.energy - debit);
    receiver.energy = Math.min(2.7, (Number(receiver.energy) || 0) + received);

    const helperLedger = ensureLedger(helperState, requesterId);
    helperLedger.given += debit;
    helperLedger.giftsGiven++;
    helperLedger.familiarity = clamp(helperLedger.familiarity + 0.12);
    helperLedger.lastInteractionStep = stepCount;
    refreshReciprocity(helperLedger, ph.reciprocityLearning);

    const receiverPh = phenotype(receiver.genome);
    const receiverState = ensureState(receiver, receiverPh);
    const receiverLedger = ensureLedger(receiverState, helperId);
    receiverLedger.received += received;
    receiverLedger.giftsReceived++;
    receiverLedger.familiarity = clamp(receiverLedger.familiarity + 0.14);
    receiverLedger.lastInteractionStep = stepCount;
    refreshReciprocity(receiverLedger, receiverPh.reciprocityLearning);
    receiverState.lastAidReceived = {
      helperId,
      received,
      publicRequestStep:candidate.request.step,
      step:stepCount,
    };

    stats.aidEvents++;
    stats.energyDebited += debit;
    stats.energyReceived += received;
    stats.metabolicAidCost += cost;
    if (candidate.ledger?.received > 0) stats.reciprocalChoices++;
    else stats.unfamiliarAidChoices++;
    return true;
  }

  function cooperationStep() {
    const grid = buildGrid();
    const requestById = new Map();
    let helpingSum = 0;
    let learningSum = 0;
    let population = 0;

    for (const [id, organism] of motile.entries()) {
      const p = position.get(id);
      if (!p) continue;
      const ph = phenotype(organism.genome);
      const state = ensureState(organism, ph);
      const request = makeSolicitation(id, organism, p, ph, state);
      if (request) requestById.set(id, request);
      helpingSum += ph.helpingTendency;
      learningSum += ph.reciprocityLearning;
      population++;
    }

    for (const [id, helper] of motile.entries()) {
      const p = position.get(id);
      if (!p) continue;
      const ph = phenotype(helper.genome);
      const state = ensureState(helper, ph);
      const candidate = chooseRequest(id, helper, state, ph, p, grid, requestById);
      if (candidate) performAid(id, helper, state, ph, candidate);
    }

    let activeLedgers = 0;
    let cooperating = 0;
    const lineages = new Set();
    for (const organism of motile.values()) {
      const ledgers = Object.values(organism.bioV58?.ledgers || {});
      activeLedgers += ledgers.length;
      if (ledgers.some(ledger => ledger.giftsGiven > 0 || ledger.giftsReceived > 0)) {
        cooperating++;
        lineages.add(organism.lineageId);
      }
    }

    stepCount++;
    stats.steps = stepCount;
    stats.activePartnerLedgers = activeLedgers;
    stats.cooperatingOrganisms = cooperating;
    stats.cooperativeLineages = lineages.size;
    stats.meanHelpingTendency = population ? helpingSum / population : 0;
    stats.meanReciprocityLearning = population ? learningSum / population : 0;
  }

  const previousStep = modules.step.bind(modules);
  modules.step = function v58ReciprocalCooperationStep(dt) {
    const result = previousStep(dt);
    accumulator += Number(dt) || 0;
    if (accumulator >= STEP_SECONDS) {
      accumulator = 0;
      cooperationStep();
    }
    return result;
  };

  const api = {
    installed:true,
    setAidRequestScoreModifier(modifier) {
      aidRequestScoreModifier = typeof modifier === 'function' ? modifier : null;
      return Boolean(aidRequestScoreModifier);
    },
    getStats:() => ({
      ...stats,
      installed:true,
      version:'v58a-conserved-reciprocal-aid',
      publicNeedSolicitation:true,
      publicSolicitationEventStream:true,
      publicSolicitationHidesNeedMagnitude:true,
      maxPublicSolicitationEvents:MAX_PUBLIC_REQUEST_EVENTS,
      noHiddenRecipientNeedInspection:true,
      aidDecisionUsesOwnSocialModel:true,
      recipientEnergyNotUsedForChoice:true,
      reciprocalHistoryBiasesAid:true,
      aidRequestScoreModifierSupported:true,
      aidRequestScoreModifierInstalled:Boolean(aidRequestScoreModifier),
      costlyHelping:true,
      energyConservingTransfer:true,
      transferEfficiency:TRANSFER_EFFICIENCY,
      boundedPartnerLedger:true,
      maxPartnerLedgers:MAX_PARTNERS,
      physicallyLocalAid:true,
      kinBiasedAid:true,
      spatialHashing:true,
      authoritativeFixedStep:true,
      noHardPopulationCap:true,
      noHardDisplayCap:true,
      surfaceRendererEnabled:false,
    }),
    getRecentPublicSolicitations() {
      return publicRequestEvents.map(event => ({ ...event }));
    },
    getCooperation(id) {
      const state = motile.get(id)?.bioV58;
      if (!state) return null;
      return {
        helpingTendency:state.helpingTendency,
        reciprocityLearning:state.reciprocityLearning,
        solicitationControl:state.solicitationControl,
        lastSolicitation:state.lastSolicitation ? { ...state.lastSolicitation } : null,
        lastAidChoice:state.lastAidChoice ? { ...state.lastAidChoice } : null,
        lastAidReceived:state.lastAidReceived ? { ...state.lastAidReceived } : null,
        ledgers:Object.fromEntries(Object.entries(state.ledgers).map(([key, ledger]) => [key, { ...ledger }])),
      };
    },
    getPopulationCooperation() {
      return [...motile.entries()]
        .map(([id, organism]) => ({
          id,
          lineageId:organism.lineageId,
          generation:organism.generation || 0,
          cooperation:api.getCooperation(id),
        }))
        .filter(item => item.cooperation);
    },
  };

  window.realitySandboxReciprocalCooperationV58 = api;
  window.realitySandboxEvolutionBuild = 'evolution-v58-reciprocal-cooperation';
  document.documentElement.dataset.evolutionBuild = 'evolution-v58-reciprocal-cooperation';
  document.documentElement.dataset.reciprocalCooperationV58 = 'conserved-public-solicitation';
}

waitForRuntime().then(install);
