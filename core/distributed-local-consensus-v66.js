const STEP_SECONDS = 0.9;
const CELL_SIZE = 122;
const DECISION_THRESHOLD = 0.12;
const MARGIN_THRESHOLD = 0.08;
const SECTORS = 8;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number(v) || 0));
const wrap = (v, max) => ((v % max) + max) % max;

async function waitForRuntime() {
  while (true) {
    const language = window.realitySandboxCompositionalLanguageV55;
    const intent = window.realitySandboxCommunicativeIntentV56;
    const influence = window.realitySandboxSituationalInfluenceV65;
    const planet = window.realitySandboxPlanet;
    const modules = window.realitySandboxModules;
    const c = planet?.world?.ecs?.components;
    if (
      language?.installed && intent?.installed && influence?.installed && modules?.step &&
      c?.motile instanceof Map && c?.position instanceof Map && c?.velocity instanceof Map
    ) return { language, intent, influence, planet, modules };
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ language, intent, influence, planet, modules }) {
  if (window.realitySandboxDistributedConsensusV66?.installed) return;

  const { world } = planet;
  const { motile, position, velocity } = world.ecs.components;
  const cols = Math.max(1, Math.ceil(world.width / CELL_SIZE));
  const rows = Math.max(1, Math.ceil(world.height / CELL_SIZE));
  const seenActSteps = new Map();
  let accumulator = 0;
  let stepCount = 0;

  const stats = {
    steps:0,
    freshPublicActs:0,
    decodedCandidateActs:0,
    localDecisions:0,
    ambiguousLocalFields:0,
    consensusSteeringApplications:0,
    dangerOverrides:0,
    activeDecisionOrganisms:0,
    locallyConvergedProposals:0,
    splitDecisionLineages:0,
    meanDecisionMargin:0,
  };

  function keyFor(x, y) {
    const cx = Math.floor(wrap(x, world.width) / CELL_SIZE) % cols;
    const cy = Math.max(0, Math.min(rows - 1, Math.floor(Math.max(0, Math.min(world.height - 0.0001, y)) / CELL_SIZE)));
    return `${cx}:${cy}`;
  }

  function neighborKeys(x, y, rings = 1) {
    const cx = Math.floor(wrap(x, world.width) / CELL_SIZE) % cols;
    const cy = Math.max(0, Math.min(rows - 1, Math.floor(Math.max(0, Math.min(world.height - 0.0001, y)) / CELL_SIZE)));
    const out = [];
    for (let oy = -rings; oy <= rings; oy++) {
      for (let ox = -rings; ox <= rings; ox++) {
        out.push(`${(cx + ox + cols) % cols}:${Math.max(0, Math.min(rows - 1, cy + oy))}`);
      }
    }
    return out;
  }

  function dxTo(targetX, originX) {
    let d = targetX - originX;
    if (d > world.width * 0.5) d -= world.width;
    else if (d < -world.width * 0.5) d += world.width;
    return d;
  }

  function distance(a, b) {
    return Math.hypot(dxTo(b.x, a.x), b.y - a.y);
  }

  function phenotype(g = {}) {
    const brain = clamp(g.brainSpeed);
    const sense = clamp(g.sense);
    const sociality = clamp(g.sociality);
    const motility = clamp(g.motility);
    return {
      consensusSensitivity:clamp(0.08 + brain * 0.36 + sociality * 0.34 + sense * 0.16),
      ambiguityTolerance:clamp(0.10 + brain * 0.34 + sense * 0.22 + sociality * 0.18),
      observationRadius:52 + sense * 150 + sociality * 84,
      locomotorSpeed:7 + motility * 36,
    };
  }

  function ensureState(organism, ph) {
    if (!organism.bioV66) {
      organism.bioV66 = {
        consensusSensitivity:ph.consensusSensitivity,
        ambiguityTolerance:ph.ambiguityTolerance,
        lastLocalDecision:null,
        lastAppliedDecision:null,
      };
    }
    organism.bioV66.consensusSensitivity = ph.consensusSensitivity;
    organism.bioV66.ambiguityTolerance = ph.ambiguityTolerance;
    return organism.bioV66;
  }

  function normalizeGesture(gesture, modifier) {
    const gx = Number(gesture?.x) || 0;
    const gy = Number(gesture?.y) || 0;
    const length = Math.hypot(gx, gy);
    if (length < 1e-6) return null;
    const sign = modifier === 'avoid' ? -1 : 1;
    return { x:(gx / length) * sign, y:(gy / length) * sign };
  }

  function sectorFor(direction) {
    const angle = Math.atan2(direction.y, direction.x);
    return ((Math.round((angle / (Math.PI * 2)) * SECTORS) % SECTORS) + SECTORS) % SECTORS;
  }

  function collectFreshActs() {
    const acts = [];
    for (const [speakerId, speaker] of motile.entries()) {
      const act = intent.getIntent?.(speakerId)?.lastIntentionalAct;
      if (!act || !Array.isArray(act.tokens) || act.tokens.length !== 2 || !act.gesture) continue;
      if (seenActSteps.get(speakerId) === act.step) continue;
      const p = position.get(speakerId);
      if (!p) continue;
      acts.push({
        speakerId,
        lineageId:speaker.lineageId,
        tokens:act.tokens.slice(0, 2),
        gesture:{ x:Number(act.gesture.x) || 0, y:Number(act.gesture.y) || 0 },
        sourceActStep:act.step,
        p:{ x:p.x, y:p.y },
      });
    }
    return acts;
  }

  function buildActGrid(acts) {
    const grid = new Map();
    for (const act of acts) {
      const key = keyFor(act.p.x, act.p.y);
      let bucket = grid.get(key);
      if (!bucket) grid.set(key, bucket = []);
      bucket.push(act);
    }
    return grid;
  }

  function decide(observerId, organism, p, ph, grid) {
    if (organism.state === 'sleeping') return null;
    const rings = Math.max(1, Math.min(3, Math.ceil(ph.observationRadius / CELL_SIZE)));
    const proposals = new Map();
    const candidates = [];

    for (const key of neighborKeys(p.x, p.y, rings)) {
      for (const act of grid.get(key) || []) {
        if (act.speakerId === observerId || act.lineageId !== organism.lineageId) continue;
        const d = distance(p, act.p);
        if (d > ph.observationRadius) continue;
        const decoded = language.decodeSequence?.(observerId, act.tokens);
        if (!decoded) continue;
        const direction = normalizeGesture(act.gesture, decoded.modifier);
        if (!direction) continue;
        const privateInfluence = influence.getInfluence?.(observerId, act.speakerId) || { score:0 };
        const locality = 1 - clamp(d / Math.max(1, ph.observationRadius));
        const weight =
          (Number(privateInfluence.score) || 0) * (0.72 + ph.consensusSensitivity * 0.16) +
          locality * 0.12;
        const sector = sectorFor(direction);
        const proposalKey = `${decoded.referent}:${decoded.modifier}:${sector}`;
        const proposal = proposals.get(proposalKey) || {
          proposalKey,
          referent:decoded.referent,
          modifier:decoded.modifier,
          sector,
          direction:{ x:0, y:0 },
          support:0,
          speakerIds:[],
        };
        proposal.support += weight;
        proposal.direction.x += direction.x * Math.max(0, weight);
        proposal.direction.y += direction.y * Math.max(0, weight);
        proposal.speakerIds.push(act.speakerId);
        proposals.set(proposalKey, proposal);
        candidates.push({ speakerId:act.speakerId, proposalKey, weight, influenceScore:Number(privateInfluence.score) || 0, distance:d });
        stats.decodedCandidateActs++;
      }
    }

    const ranked = [...proposals.values()].sort((a,b) => b.support - a.support);
    const winner = ranked[0] || null;
    const runnerUp = ranked[1] || null;
    if (!winner || winner.support < DECISION_THRESHOLD) return { decision:null, candidates, ranked };
    const margin = winner.support - Math.max(0, runnerUp?.support || 0);
    const requiredMargin = MARGIN_THRESHOLD * (1.10 - ph.ambiguityTolerance * 0.20);
    if (margin < requiredMargin) return { decision:null, candidates, ranked, ambiguous:true, margin, requiredMargin };

    const length = Math.hypot(winner.direction.x, winner.direction.y);
    const direction = length > 1e-6
      ? { x:winner.direction.x / length, y:winner.direction.y / length }
      : { x:Math.cos(winner.sector / SECTORS * Math.PI * 2), y:Math.sin(winner.sector / SECTORS * Math.PI * 2) };
    return {
      decision:{
        proposalKey:winner.proposalKey,
        referent:winner.referent,
        modifier:winner.modifier,
        sector:winner.sector,
        direction,
        support:winner.support,
        runnerUpSupport:runnerUp?.support || 0,
        margin,
        requiredMargin,
        speakerIds:[...new Set(winner.speakerIds)],
        candidateCount:candidates.length,
        step:stepCount,
      },
      candidates,
      ranked,
    };
  }

  function urgentDanger(organism) {
    const brain = organism.bioV50 || {};
    return brain.mode === 'flee' || Number.isFinite(brain.detectedDanger);
  }

  function applyDecision(id, organism, state, ph, decision) {
    if (!decision) return false;
    if (urgentDanger(organism)) {
      state.lastAppliedDecision = {
        proposalKey:decision.proposalKey,
        applied:false,
        interrupted:true,
        reason:'detected-danger',
        step:stepCount,
      };
      stats.dangerOverrides++;
      return false;
    }
    const vel = velocity.get(id);
    if (!vel) return false;
    const strength = clamp(0.10 + decision.margin * (0.22 + ph.consensusSensitivity * 0.12), 0.10, 0.28);
    const blend = 1 - strength;
    const speed = ph.locomotorSpeed * (0.42 + ph.consensusSensitivity * 0.12);
    const before = { vx:vel.vx, vy:vel.vy };
    const beforeDirectional = before.vx * decision.direction.x + before.vy * decision.direction.y;
    vel.vx = vel.vx * blend + decision.direction.x * speed * strength;
    vel.vy = vel.vy * blend + decision.direction.y * speed * strength;
    const after = { vx:vel.vx, vy:vel.vy };
    const afterDirectional = after.vx * decision.direction.x + after.vy * decision.direction.y;
    state.lastAppliedDecision = {
      proposalKey:decision.proposalKey,
      direction:{ ...decision.direction },
      margin:decision.margin,
      strength,
      velocityBefore:before,
      velocityAfter:after,
      directionalVelocityBefore:beforeDirectional,
      directionalVelocityAfter:afterDirectional,
      directionalVelocityDelta:afterDirectional - beforeDirectional,
      applied:true,
      interrupted:false,
      step:stepCount,
    };
    stats.consensusSteeringApplications++;
    return true;
  }

  function deriveDecisionField() {
    const decisions = [];
    for (const [id, organism] of motile.entries()) {
      const decision = organism.bioV66?.lastLocalDecision;
      if (!decision) continue;
      decisions.push({ id, lineageId:organism.lineageId, proposalKey:decision.proposalKey, margin:decision.margin, support:decision.support });
    }
    const byLineage = new Map();
    for (const item of decisions) {
      let lineage = byLineage.get(item.lineageId);
      if (!lineage) byLineage.set(item.lineageId, lineage = new Map());
      lineage.set(item.proposalKey, (lineage.get(item.proposalKey) || 0) + 1);
    }
    const lineages = [];
    for (const [lineageId, proposals] of byLineage.entries()) {
      const ranked = [...proposals.entries()].map(([proposalKey, observers]) => ({ proposalKey, observers })).sort((a,b) => b.observers - a.observers);
      lineages.push({ lineageId, proposals:ranked });
    }
    return { decisions, lineages };
  }

  function consensusStep() {
    const acts = collectFreshActs();
    const grid = buildActGrid(acts);
    let marginSum = 0;
    let decisions = 0;

    for (const [id, organism] of motile.entries()) {
      const p = position.get(id);
      if (!p) continue;
      const ph = phenotype(organism.genome);
      const state = ensureState(organism, ph);
      if (!acts.length) continue;
      state.lastLocalDecision = null;
      const result = decide(id, organism, p, ph, grid);
      if (result?.ambiguous) stats.ambiguousLocalFields++;
      if (!result?.decision) continue;
      state.lastLocalDecision = { ...result.decision, direction:{ ...result.decision.direction }, speakerIds:result.decision.speakerIds.slice() };
      stats.localDecisions++;
      marginSum += result.decision.margin;
      decisions++;
      applyDecision(id, organism, state, ph, result.decision);
    }

    for (const act of acts) seenActSteps.set(act.speakerId, act.sourceActStep);
    const field = deriveDecisionField();
    let converged = 0;
    let splits = 0;
    for (const lineage of field.lineages) {
      if (lineage.proposals.some(item => item.observers >= 2)) converged++;
      if (lineage.proposals.length >= 2) splits++;
    }

    stepCount++;
    stats.steps = stepCount;
    stats.freshPublicActs = acts.length;
    stats.activeDecisionOrganisms = field.decisions.length;
    stats.locallyConvergedProposals = converged;
    stats.splitDecisionLineages = splits;
    stats.meanDecisionMargin = decisions ? marginSum / decisions : 0;
  }

  const previousStep = modules.step.bind(modules);
  modules.step = function v66DistributedLocalConsensusStep(dt) {
    const result = previousStep(dt);
    accumulator += Number(dt) || 0;
    if (accumulator >= STEP_SECONDS) {
      accumulator = 0;
      consensusStep();
    }
    return result;
  };

  const api = {
    installed:true,
    getStats:() => ({
      ...stats,
      installed:true,
      version:'v66a-distributed-local-consensus',
      usesPublicV56TokensAndGesturesOnly:true,
      listenerDecodesOwnV55Semantics:true,
      speakerPairUtilityAndWillingnessIgnored:true,
      privateWeightFromOwnV65InfluenceOnly:true,
      physicallyLocalProposalCompetition:true,
      compatibleSignalsAggregateLocally:true,
      decisionRequiresSupportAndMargin:true,
      decisionsStoredPerOrganismOnly:true,
      aggregateConsensusDerivedOnDemand:true,
      noGlobalVoteLedger:true,
      noGovernmentAuthorityOrLeaderObject:true,
      noStoredGroupDecision:true,
      consensusCanSplitAndReform:true,
      physicalSteeringContribution:true,
      detectedDangerOverridesConsensus:true,
      decisionThreshold:DECISION_THRESHOLD,
      marginThreshold:MARGIN_THRESHOLD,
      directionSectors:SECTORS,
      spatialHashing:true,
      authoritativeFixedStep:true,
      noHardPopulationCap:true,
      noHardDisplayCap:true,
      surfaceRendererEnabled:false,
    }),
    getDecision(id) {
      const state = motile.get(id)?.bioV66;
      if (!state) return null;
      return {
        consensusSensitivity:state.consensusSensitivity,
        ambiguityTolerance:state.ambiguityTolerance,
        lastLocalDecision:state.lastLocalDecision ? {
          ...state.lastLocalDecision,
          direction:{ ...state.lastLocalDecision.direction },
          speakerIds:state.lastLocalDecision.speakerIds?.slice() || [],
        } : null,
        lastAppliedDecision:state.lastAppliedDecision ? {
          ...state.lastAppliedDecision,
          direction:state.lastAppliedDecision.direction ? { ...state.lastAppliedDecision.direction } : undefined,
          velocityBefore:state.lastAppliedDecision.velocityBefore ? { ...state.lastAppliedDecision.velocityBefore } : undefined,
          velocityAfter:state.lastAppliedDecision.velocityAfter ? { ...state.lastAppliedDecision.velocityAfter } : undefined,
        } : null,
      };
    },
    getPopulationDecisions() {
      return [...motile.entries()]
        .map(([id, organism]) => ({ id, lineageId:organism.lineageId, decision:api.getDecision(id) }))
        .filter(item => item.decision);
    },
    getDecisionField() {
      const field = deriveDecisionField();
      return {
        decisions:field.decisions.map(item => ({ ...item })),
        lineages:field.lineages.map(item => ({ lineageId:item.lineageId, proposals:item.proposals.map(p => ({ ...p })) })),
      };
    },
  };

  window.realitySandboxDistributedConsensusV66 = api;
  window.realitySandboxEvolutionBuild = 'evolution-v66-distributed-local-consensus';
  document.documentElement.dataset.evolutionBuild = 'evolution-v66-distributed-local-consensus';
  document.documentElement.dataset.distributedConsensusV66 = 'private-local-decisions';
}

waitForRuntime().then(install);
