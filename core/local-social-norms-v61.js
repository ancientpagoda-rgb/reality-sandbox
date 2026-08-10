const STEP_SECONDS = 0.9;
const CELL_SIZE = 112;
const MAX_PENDING_REQUESTS = 6;
const REQUEST_RESOLUTION_STEPS = 2;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number(v) || 0));
const clampSigned = v => Math.max(-1, Math.min(1, Number(v) || 0));
const wrap = (v, max) => ((v % max) + max) % max;

async function waitForRuntime() {
  while (true) {
    const cooperation = window.realitySandboxReciprocalCooperationV58;
    const reputation = window.realitySandboxPublicReputationV59;
    const indirect = window.realitySandboxIndirectReciprocityV60;
    const planet = window.realitySandboxPlanet;
    const modules = window.realitySandboxModules;
    const c = planet?.world?.ecs?.components;
    if (
      cooperation?.installed && reputation?.installed && indirect?.installed &&
      typeof cooperation.getRecentPublicSolicitations === 'function' &&
      typeof cooperation.setAidRequestScoreModifier === 'function' &&
      modules?.step && c?.motile instanceof Map && c?.position instanceof Map
    ) return { cooperation, reputation, indirect, planet, modules };
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ cooperation, reputation, indirect, planet, modules }) {
  if (window.realitySandboxLocalSocialNormsV61?.installed) return;

  const { world } = planet;
  const { motile, position } = world.ecs.components;
  const cols = Math.max(1, Math.ceil(world.width / CELL_SIZE));
  const rows = Math.max(1, Math.ceil(world.height / CELL_SIZE));
  let accumulator = 0;
  let stepCount = 0;
  let lastPublicRequestEventId = 0;

  const stats = {
    steps:0,
    publicRequestsObserved:0,
    answeredRequestsLearned:0,
    unansweredRequestsLearned:0,
    normUpdates:0,
    normScoreEvaluations:0,
    normAdjustedAidScores:0,
    positiveNormAdjustments:0,
    negativeNormAdjustments:0,
    activeNormLearners:0,
    normLineages:0,
    meanHelpingNorm:0.5,
    meanNormEvidence:0,
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
    return {
      normLearning:clamp(0.08 + brain * 0.44 + sociality * 0.32 + sense * 0.10),
      conformity:clamp(0.08 + sociality * 0.50 + brain * 0.22 + sense * 0.08),
      observationAcuity:clamp(0.10 + sense * 0.46 + brain * 0.28 + sociality * 0.12),
      observationRadius:50 + sense * 128 + sociality * 82,
    };
  }

  function ensureState(organism, ph) {
    if (!organism.bioV61) {
      organism.bioV61 = {
        normLearning:ph.normLearning,
        conformity:ph.conformity,
        observationAcuity:ph.observationAcuity,
        helpingNorm:0.5,
        normEvidence:0,
        answeredObserved:0,
        unansweredObserved:0,
        pendingRequests:[],
        lastNormUpdate:null,
        lastNormScore:null,
      };
    }
    const state = organism.bioV61;
    state.normLearning = ph.normLearning;
    state.conformity = ph.conformity;
    state.observationAcuity = ph.observationAcuity;
    state.pendingRequests ||= [];
    return state;
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

  function rememberRequest(observerId, observer, state, ph, p, event) {
    if (observerId === event.requesterId || observer.state === 'sleeping') return false;
    if (observer.lineageId !== event.lineageId || ph.observationAcuity < 0.20) return false;
    if (distance(p, event) > ph.observationRadius) return false;
    if (state.pendingRequests.some(item => item.requesterId === event.requesterId)) return false;

    if (state.pendingRequests.length >= MAX_PENDING_REQUESTS) state.pendingRequests.shift();
    state.pendingRequests.push({
      eventId:event.eventId,
      requesterId:event.requesterId,
      requestStep:event.step,
      observedAtStep:stepCount,
    });
    stats.publicRequestsObserved++;
    return true;
  }

  function observeNewPublicRequests(grid) {
    const events = cooperation.getRecentPublicSolicitations?.() || [];
    const fresh = events.filter(event => Number(event.eventId) > lastPublicRequestEventId);
    if (!fresh.length) return;
    const rings = 4;
    for (const event of fresh) {
      for (const key of neighborKeys(event.x, event.y, rings)) {
        for (const observerId of grid.get(key) || []) {
          const observer = motile.get(observerId);
          const p = position.get(observerId);
          if (!observer || !p) continue;
          const ph = phenotype(observer.genome);
          const state = ensureState(observer, ph);
          rememberRequest(observerId, observer, state, ph, p, event);
        }
      }
      lastPublicRequestEventId = Math.max(lastPublicRequestEventId, Number(event.eventId) || 0);
    }
  }

  function updateNorm(state, ph, outcome, pending, aidEvent = null) {
    const learning = 0.14 + ph.normLearning * 0.14;
    state.helpingNorm = clamp(state.helpingNorm * (1 - learning) + outcome * learning);
    state.normEvidence++;
    if (outcome > 0.5) {
      state.answeredObserved++;
      stats.answeredRequestsLearned++;
    } else {
      state.unansweredObserved++;
      stats.unansweredRequestsLearned++;
    }
    state.lastNormUpdate = {
      requesterId:pending.requesterId,
      answered:outcome > 0.5,
      helperId:aidEvent?.helperId ?? null,
      helpingNorm:state.helpingNorm,
      evidence:state.normEvidence,
      step:stepCount,
    };
    stats.normUpdates++;
  }

  function resolveObservedRequests() {
    const aidEvents = reputation.getRecentPublicAidEvents?.() || [];
    for (const [observerId, observer] of motile.entries()) {
      const ph = phenotype(observer.genome);
      const state = ensureState(observer, ph);
      if (!state.pendingRequests.length) continue;
      const remaining = [];
      for (const pending of state.pendingRequests) {
        const aidEvent = aidEvents.find(event =>
          event.recipientId === pending.requesterId &&
          Number(event.sourceStep) >= pending.requestStep &&
          Number(event.sourceStep) <= pending.requestStep + REQUEST_RESOLUTION_STEPS
        );
        if (aidEvent) {
          if (aidEvent.helperId !== observerId) updateNorm(state, ph, 1, pending, aidEvent);
          continue;
        }
        if (stepCount - pending.observedAtStep >= REQUEST_RESOLUTION_STEPS) {
          updateNorm(state, ph, 0, pending, null);
          continue;
        }
        remaining.push(pending);
      }
      state.pendingRequests = remaining;
    }
  }

  function scoreAidRequest(context) {
    stats.normScoreEvaluations++;
    const indirectScore = Number(indirect.scoreAidRequest(context));
    const base = Number.isFinite(indirectScore) ? indirectScore : context.baseScore;
    const helper = motile.get(context.helperId);
    if (!helper) return base;
    const ph = phenotype(helper.genome);
    const state = ensureState(helper, ph);
    if (state.normEvidence < 1) {
      state.lastNormScore = { requesterId:context.requesterId, baseScore:base, adjustment:0, finalScore:base, step:stepCount };
      return base;
    }

    const confidence = clamp(state.normEvidence / 4);
    const centeredNorm = (state.helpingNorm - 0.5) * 2;
    const adjustment = clampSigned(
      centeredNorm * ph.conformity * (0.055 + confidence * 0.045)
    );
    const finalScore = base + adjustment;
    state.lastNormScore = {
      requesterId:context.requesterId,
      baseScore:base,
      adjustment,
      finalScore,
      helpingNorm:state.helpingNorm,
      confidence,
      step:stepCount,
    };
    if (Math.abs(adjustment) > 1e-9) {
      stats.normAdjustedAidScores++;
      if (adjustment > 0) stats.positiveNormAdjustments++;
      else stats.negativeNormAdjustments++;
    }
    return finalScore;
  }

  function installModifier() {
    return cooperation.setAidRequestScoreModifier(scoreAidRequest);
  }

  function normStep() {
    const grid = buildGrid();
    observeNewPublicRequests(grid);
    resolveObservedRequests();

    let normSum = 0;
    let evidenceSum = 0;
    let population = 0;
    let active = 0;
    const lineages = new Set();
    for (const organism of motile.values()) {
      const ph = phenotype(organism.genome);
      const state = ensureState(organism, ph);
      normSum += state.helpingNorm;
      evidenceSum += state.normEvidence;
      population++;
      if (state.normEvidence > 0) {
        active++;
        lineages.add(organism.lineageId);
      }
    }

    stepCount++;
    stats.steps = stepCount;
    stats.activeNormLearners = active;
    stats.normLineages = lineages.size;
    stats.meanHelpingNorm = population ? normSum / population : 0.5;
    stats.meanNormEvidence = population ? evidenceSum / population : 0;
  }

  installModifier();

  const previousStep = modules.step.bind(modules);
  modules.step = function v61LocalSocialNormStep(dt) {
    const result = previousStep(dt);
    accumulator += Number(dt) || 0;
    if (accumulator >= STEP_SECONDS) {
      accumulator = 0;
      normStep();
    }
    return result;
  };

  const api = {
    installed:true,
    installModifier,
    scoreAidRequest,
    getStats:() => ({
      ...stats,
      installed:true,
      version:'v61a-local-answered-request-norms',
      normFromPublicRequestsAndAidOnly:true,
      unansweredRequestsAreGroupEvidence:true,
      noIndividualRefusalAttribution:true,
      publicRequestStreamHidesNeedMagnitude:true,
      differentGroupsCanLearnDifferentNorms:true,
      noEvidencePreservesV60Score:true,
      normsAffectAidWillingness:true,
      v60IndirectReciprocityPreserved:true,
      v58ConservedTransferPreserved:true,
      boundedPendingRequestMemory:true,
      maxPendingRequests:MAX_PENDING_REQUESTS,
      requestResolutionSteps:REQUEST_RESOLUTION_STEPS,
      authoritativeFixedStep:true,
      noHardPopulationCap:true,
      noHardDisplayCap:true,
      surfaceRendererEnabled:false,
    }),
    getNorm(id) {
      const state = motile.get(id)?.bioV61;
      if (!state) return null;
      return {
        normLearning:state.normLearning,
        conformity:state.conformity,
        observationAcuity:state.observationAcuity,
        helpingNorm:state.helpingNorm,
        normEvidence:state.normEvidence,
        answeredObserved:state.answeredObserved,
        unansweredObserved:state.unansweredObserved,
        pendingRequests:state.pendingRequests.map(item => ({ ...item })),
        lastNormUpdate:state.lastNormUpdate ? { ...state.lastNormUpdate } : null,
        lastNormScore:state.lastNormScore ? { ...state.lastNormScore } : null,
      };
    },
    getPopulationNorms() {
      return [...motile.entries()]
        .map(([id, organism]) => ({ id, lineageId:organism.lineageId, norm:api.getNorm(id) }))
        .filter(item => item.norm);
    },
  };

  window.realitySandboxLocalSocialNormsV61 = api;
  window.realitySandboxEvolutionBuild = 'evolution-v61-local-social-norms';
  document.documentElement.dataset.evolutionBuild = 'evolution-v61-local-social-norms';
  document.documentElement.dataset.localSocialNormsV61 = 'answered-request-neighborhood-learning';
}

waitForRuntime().then(install);
