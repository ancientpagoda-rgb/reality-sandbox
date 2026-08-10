const STEP_SECONDS = 0.9;
const CELL_SIZE = 118;
const MAX_REPUTATIONS = 8;
const MAX_OBSERVATION_RADIUS = 250;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number(v) || 0));
const wrap = (v, max) => ((v % max) + max) % max;

async function waitForRuntime() {
  while (true) {
    const cooperation = window.realitySandboxReciprocalCooperationV58;
    const social = window.realitySandboxSocialModelsV57;
    const origin = window.realitySandboxOriginMotileLifeV47;
    const planet = window.realitySandboxPlanet;
    const modules = window.realitySandboxModules;
    const c = planet?.world?.ecs?.components;
    if (
      cooperation?.installed && social?.installed && origin?.installed && modules?.step &&
      c?.motile instanceof Map && c?.position instanceof Map
    ) return { cooperation, social, planet, modules };
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ cooperation, social, planet, modules }) {
  if (window.realitySandboxPublicReputationV59?.installed) return;

  const { world } = planet;
  const { motile, position } = world.ecs.components;
  const cols = Math.max(1, Math.ceil(world.width / CELL_SIZE));
  const rows = Math.max(1, Math.ceil(world.height / CELL_SIZE));
  const seenReceipts = new Map();
  const recentPublicEvents = [];
  const nativeScoreAudience = typeof social.scoreAudience === 'function'
    ? social.scoreAudience.bind(social)
    : ((_observerId, _partnerId, baseScore) => Number(baseScore) || 0);
  let accumulator = 0;
  let stepCount = 0;
  let publicEventOrdinal = 1;

  const stats = {
    steps:0,
    publicAidEvents:0,
    thirdPartyWitnesses:0,
    reputationUpdates:0,
    reputationDecays:0,
    reputationBiasedAudienceScores:0,
    activeReputationEntries:0,
    reputationalObservers:0,
    reputationLineages:0,
    observerDisagreements:0,
    meanObservationAcuity:0,
    meanReputationMemory:0,
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

  function phenotype(g = {}) {
    const brain = clamp(g.brainSpeed);
    const sense = clamp(g.sense);
    const sociality = clamp(g.sociality);
    return {
      observationAcuity:clamp(0.04 + sense * 0.44 + brain * 0.34 + sociality * 0.16),
      reputationMemory:clamp(0.08 + brain * 0.50 + sociality * 0.30 + sense * 0.08),
      reputationSelectivity:clamp(0.06 + brain * 0.40 + sociality * 0.38 + sense * 0.10),
      observationRadius:48 + sense * 142 + sociality * 58,
    };
  }

  function newEntry(targetId) {
    return {
      targetId,
      prosociality:0,
      aidWitnesses:0,
      familiarity:0,
      lastObservedStep:stepCount,
    };
  }

  function ensureState(organism, ph) {
    if (!organism.bioV59) {
      organism.bioV59 = {
        observationAcuity:ph.observationAcuity,
        reputationMemory:ph.reputationMemory,
        reputationSelectivity:ph.reputationSelectivity,
        reputations:{},
        lastWitnessedAid:null,
        preferredReputedPartnerId:null,
        preferredReputedPartnerScore:0,
      };
    }
    const state = organism.bioV59;
    state.observationAcuity = ph.observationAcuity;
    state.reputationMemory = ph.reputationMemory;
    state.reputationSelectivity = ph.reputationSelectivity;
    state.reputations ||= {};
    return state;
  }

  function retentionScore(entry) {
    const evidence = clamp(entry.aidWitnesses / 5);
    const agePenalty = clamp((stepCount - entry.lastObservedStep) / 220) * 0.14;
    return entry.familiarity * 0.34 + entry.prosociality * 0.36 + evidence * 0.30 - agePenalty;
  }

  function ensureEntry(state, targetId) {
    const key = String(targetId);
    if (state.reputations[key]) return state.reputations[key];
    const keys = Object.keys(state.reputations);
    if (keys.length >= MAX_REPUTATIONS) {
      let weakest = null;
      let weakestScore = Infinity;
      for (const existing of keys) {
        const score = retentionScore(state.reputations[existing]);
        if (score < weakestScore) {
          weakestScore = score;
          weakest = existing;
        }
      }
      if (weakest != null) delete state.reputations[weakest];
    }
    return state.reputations[key] = newEntry(targetId);
  }

  function midpoint(a, b) {
    return {
      x:wrap(a.x + dxTo(b.x, a.x) * 0.5, world.width),
      y:(a.y + b.y) * 0.5,
    };
  }

  // v58 exposes lastAidReceived for inspection after a physically completed
  // transfer. Convert only that observable fact into a public event: identities,
  // place and time. No energy amount, ledger balance, need level, or hidden choice
  // state is copied into the event available to organisms.
  function collectPublicAidEvents() {
    const events = [];
    for (const item of cooperation.getPopulationCooperation?.() || []) {
      const receipt = item.cooperation?.lastAidReceived;
      if (!receipt || receipt.helperId == null || !Number.isFinite(Number(receipt.step))) continue;
      const receiptStep = Number(receipt.step);
      const key = `${item.id}:${receipt.helperId}`;
      if ((seenReceipts.get(key) ?? -Infinity) >= receiptStep) continue;
      seenReceipts.set(key, receiptStep);

      const helper = motile.get(receipt.helperId);
      const recipient = motile.get(item.id);
      const hp = position.get(receipt.helperId);
      const rp = position.get(item.id);
      if (!helper || !recipient || !hp || !rp || helper.lineageId !== recipient.lineageId) continue;
      const p = midpoint(hp, rp);
      const event = {
        id:publicEventOrdinal++,
        kind:'aid',
        helperId:receipt.helperId,
        recipientId:item.id,
        lineageId:recipient.lineageId,
        x:p.x,
        y:p.y,
        sourceStep:receiptStep,
        observedStep:stepCount,
      };
      events.push(event);
      recentPublicEvents.push(event);
      if (recentPublicEvents.length > 32) recentPublicEvents.splice(0, recentPublicEvents.length - 32);
      stats.publicAidEvents++;
    }
    return events;
  }

  function updateWitness(observerId, observer, state, ph, p, event) {
    if (observerId === event.helperId || observerId === event.recipientId) return false;
    if (observer.lineageId !== event.lineageId || observer.state === 'sleeping') return false;
    if (ph.observationAcuity < 0.20) return false;
    const d = distance(p, event);
    if (d > ph.observationRadius) return false;

    const proximity = 1 - clamp(d / Math.max(1, ph.observationRadius));
    const salience = clamp(proximity * 0.58 + ph.observationAcuity * 0.42);
    if (salience < 0.18) return false;

    const entry = ensureEntry(state, event.helperId);
    const target = clamp(0.52 + salience * 0.48);
    const learning = 0.18 + ph.reputationMemory * 0.20;
    entry.prosociality = clamp(entry.prosociality * (1 - learning) + target * learning);
    entry.aidWitnesses++;
    entry.familiarity = clamp(entry.familiarity + 0.08 + salience * 0.08);
    entry.lastObservedStep = stepCount;
    state.lastWitnessedAid = {
      eventId:event.id,
      helperId:event.helperId,
      recipientId:event.recipientId,
      salience,
      distance:d,
      step:stepCount,
    };
    stats.thirdPartyWitnesses++;
    stats.reputationUpdates++;
    return true;
  }

  function observePublicEvents(events, grid) {
    if (!events.length) return;
    const rings = Math.max(1, Math.min(4, Math.ceil(MAX_OBSERVATION_RADIUS / CELL_SIZE)));
    for (const event of events) {
      const visited = new Set();
      for (const key of neighborKeys(event.x, event.y, rings)) {
        for (const observerId of grid.get(key) || []) {
          if (visited.has(observerId)) continue;
          visited.add(observerId);
          const observer = motile.get(observerId);
          const p = position.get(observerId);
          if (!observer || !p) continue;
          const ph = phenotype(observer.genome);
          const state = ensureState(observer, ph);
          updateWitness(observerId, observer, state, ph, p, event);
        }
      }
    }
  }

  function decayReputations(state, ph) {
    const decay = 0.0014 * (1.08 - ph.reputationMemory * 0.82);
    for (const entry of Object.values(state.reputations)) {
      const before = entry.prosociality;
      entry.prosociality = Math.max(0, entry.prosociality - decay);
      entry.familiarity = Math.max(0, entry.familiarity - decay * 0.35);
      if (entry.prosociality !== before) stats.reputationDecays++;
    }
  }

  function choosePreferredReputedPartner(id, organism, state, ph, p) {
    let bestId = null;
    let bestScore = -Infinity;
    for (const entry of Object.values(state.reputations)) {
      if (entry.aidWitnesses < 1) continue;
      const other = motile.get(entry.targetId);
      const op = position.get(entry.targetId);
      if (!other || !op || other.lineageId !== organism.lineageId) continue;
      const d = distance(p, op);
      if (d > ph.observationRadius) continue;
      const score =
        entry.prosociality * (0.68 + ph.reputationSelectivity * 0.22) +
        entry.familiarity * 0.08 +
        (1 - d / Math.max(1, ph.observationRadius)) * 0.10;
      if (score > bestScore) {
        bestScore = score;
        bestId = entry.targetId;
      }
    }
    state.preferredReputedPartnerId = bestId;
    state.preferredReputedPartnerScore = Number.isFinite(bestScore) ? bestScore : 0;
  }

  function reputationAudienceScore(observerId, partnerId, baseScore) {
    const observer = motile.get(observerId);
    const state = observer?.bioV59;
    const entry = state?.reputations?.[String(partnerId)];
    if (!entry || entry.aidWitnesses < 1) return Number(baseScore) || 0;
    const evidence = clamp(entry.aidWitnesses / 4);
    const adjustment = (
      entry.prosociality * (0.12 + evidence * 0.08) +
      entry.familiarity * 0.025
    ) * (0.55 + clamp(state.reputationSelectivity) * 0.45);
    stats.reputationBiasedAudienceScores++;
    return (Number(baseScore) || 0) + adjustment;
  }

  social.scoreAudience = function v59PublicReputationAudienceScore(observerId, partnerId, baseScore, ...rest) {
    const directScore = nativeScoreAudience(observerId, partnerId, baseScore, ...rest);
    return reputationAudienceScore(observerId, partnerId, directScore);
  };

  function disagreementCount() {
    const byTarget = new Map();
    for (const organism of motile.values()) {
      for (const entry of Object.values(organism.bioV59?.reputations || {})) {
        let values = byTarget.get(entry.targetId);
        if (!values) byTarget.set(entry.targetId, values = []);
        values.push(entry.prosociality);
      }
    }
    let disagreements = 0;
    for (const values of byTarget.values()) {
      if (values.length < 2) continue;
      if (Math.max(...values) - Math.min(...values) > 0.12) disagreements++;
    }
    return disagreements;
  }

  function reputationStep() {
    const grid = buildGrid();
    const events = collectPublicAidEvents();
    observePublicEvents(events, grid);

    let acuitySum = 0;
    let memorySum = 0;
    let population = 0;
    let active = 0;
    let observers = 0;
    const lineages = new Set();

    for (const [id, organism] of motile.entries()) {
      const p = position.get(id);
      if (!p) continue;
      const ph = phenotype(organism.genome);
      const state = ensureState(organism, ph);
      decayReputations(state, ph);
      choosePreferredReputedPartner(id, organism, state, ph, p);
      const entries = Object.values(state.reputations);
      active += entries.length;
      if (entries.length) {
        observers++;
        lineages.add(organism.lineageId);
      }
      acuitySum += ph.observationAcuity;
      memorySum += ph.reputationMemory;
      population++;
    }

    stepCount++;
    stats.steps = stepCount;
    stats.activeReputationEntries = active;
    stats.reputationalObservers = observers;
    stats.reputationLineages = lineages.size;
    stats.observerDisagreements = disagreementCount();
    stats.meanObservationAcuity = population ? acuitySum / population : 0;
    stats.meanReputationMemory = population ? memorySum / population : 0;
  }

  const previousStep = modules.step.bind(modules);
  modules.step = function v59PublicReputationStep(dt) {
    const result = previousStep(dt);
    accumulator += Number(dt) || 0;
    if (accumulator >= STEP_SECONDS) {
      accumulator = 0;
      reputationStep();
    }
    return result;
  };

  const api = {
    installed:true,
    scoreAudience:reputationAudienceScore,
    getStats:() => ({
      ...stats,
      installed:true,
      version:'v59a-local-witnessed-reputation',
      reputationFromPublicAidOnly:true,
      thirdPartyWitnessRequired:true,
      localSensoryWitnessRequired:true,
      noGlobalReputationRegistry:true,
      observersCanDisagree:true,
      noHiddenAidAmount:true,
      noPrivateLedgerInspectionByAgents:true,
      reputationBiasesAudienceSelection:true,
      boundedReputationMemory:true,
      maxReputationEntries:MAX_REPUTATIONS,
      spatialHashing:true,
      authoritativeFixedStep:true,
      noHardPopulationCap:true,
      noHardDisplayCap:true,
      surfaceRendererEnabled:false,
    }),
    getReputation(observerId, targetId) {
      const state = motile.get(observerId)?.bioV59;
      const entry = state?.reputations?.[String(targetId)];
      return entry ? { ...entry } : null;
    },
    getObserverReputations(observerId) {
      const state = motile.get(observerId)?.bioV59;
      if (!state) return null;
      return {
        observationAcuity:state.observationAcuity,
        reputationMemory:state.reputationMemory,
        reputationSelectivity:state.reputationSelectivity,
        lastWitnessedAid:state.lastWitnessedAid ? { ...state.lastWitnessedAid } : null,
        preferredReputedPartnerId:state.preferredReputedPartnerId,
        preferredReputedPartnerScore:state.preferredReputedPartnerScore,
        reputations:Object.fromEntries(Object.entries(state.reputations).map(([key, entry]) => [key, { ...entry }])),
      };
    },
    getPopulationReputations() {
      return [...motile.entries()]
        .map(([id, organism]) => ({
          id,
          lineageId:organism.lineageId,
          reputation:api.getObserverReputations(id),
        }))
        .filter(item => item.reputation);
    },
    getRecentPublicAidEvents:() => recentPublicEvents.map(event => ({ ...event })),
  };

  window.realitySandboxPublicReputationV59 = api;
  window.realitySandboxEvolutionBuild = 'evolution-v59-public-reputation';
  document.documentElement.dataset.evolutionBuild = 'evolution-v59-public-reputation';
  document.documentElement.dataset.publicReputationV59 = 'local-third-party-witnesses';
}

waitForRuntime().then(install);