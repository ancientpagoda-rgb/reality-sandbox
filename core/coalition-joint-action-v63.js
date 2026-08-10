const STEP_SECONDS = 0.9;
const MAX_COMMITMENT_STEPS = 6;
const AFFILIATION_THRESHOLD = 0.30;
const EVIDENCE_THRESHOLD = 0.18;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number(v) || 0));

async function waitForRuntime() {
  while (true) {
    const intent = window.realitySandboxCommunicativeIntentV56;
    const coalitions = window.realitySandboxProtoCoalitionsV62;
    const planet = window.realitySandboxPlanet;
    const modules = window.realitySandboxModules;
    const c = planet?.world?.ecs?.components;
    if (
      intent?.installed && coalitions?.installed && modules?.step &&
      c?.motile instanceof Map && c?.velocity instanceof Map
    ) return { intent, coalitions, planet, modules };
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ intent, coalitions, planet, modules }) {
  if (window.realitySandboxCoalitionJointActionV63?.installed) return;

  const { motile, velocity } = planet.world.ecs.components;
  let accumulator = 0;
  let stepCount = 0;

  const stats = {
    steps:0,
    jointAttentionEventsSeen:0,
    affiliateCommitmentsStarted:0,
    weakAffiliationPassThroughs:0,
    commitmentsApplied:0,
    commitmentsCompleted:0,
    commitmentsInterruptedByUrgentNeed:0,
    activeCommitments:0,
    coordinatingOrganisms:0,
    coordinatingLineages:0,
    meanCoordinationPersistence:0,
    meanAffiliateResponsiveness:0,
  };

  function phenotype(g = {}) {
    const brain = clamp(g.brainSpeed);
    const sociality = clamp(g.sociality);
    const sense = clamp(g.sense);
    const motility = clamp(g.motility);
    return {
      coordinationPersistence:clamp(0.08 + brain * 0.38 + sociality * 0.34 + sense * 0.12),
      affiliateResponsiveness:clamp(0.08 + sociality * 0.40 + brain * 0.30 + sense * 0.12),
      locomotorSpeed:3 + motility * 10 + brain * 2.2,
    };
  }

  function ensureState(organism, ph) {
    if (!organism.bioV63) {
      organism.bioV63 = {
        coordinationPersistence:ph.coordinationPersistence,
        affiliateResponsiveness:ph.affiliateResponsiveness,
        lastJointAttentionKey:null,
        commitment:null,
        lastAppliedCommitment:null,
      };
    }
    organism.bioV63.coordinationPersistence = ph.coordinationPersistence;
    organism.bioV63.affiliateResponsiveness = ph.affiliateResponsiveness;
    return organism.bioV63;
  }

  function normalizedDirection(direction) {
    const x = Number(direction?.x) || 0;
    const y = Number(direction?.y) || 0;
    const d = Math.hypot(x, y);
    if (d < 1e-9) return null;
    return { x:x / d, y:y / d };
  }

  function urgentLocalNeed(organism) {
    // A routine food/scavenge/prey target is not an emergency: bounded social
    // commitment may temporarily persist alongside ordinary foraging. Immediate
    // interruption is reserved for actually detected danger.
    return Boolean(organism.bioV50?.detectedDanger);
  }

  function affiliationTo(id, speakerId) {
    return coalitions.getAffiliation?.(id)?.affiliations?.[String(speakerId)] || null;
  }

  function observeJointAttention(id, organism, state, ph) {
    const joint = intent.getIntent?.(id)?.lastJointAttention || null;
    if (!joint || joint.speakerId == null || joint.step == null) return;
    const key = `${joint.speakerId}:${joint.step}`;
    if (state.lastJointAttentionKey === key) return;
    state.lastJointAttentionKey = key;
    stats.jointAttentionEventsSeen++;

    const direction = normalizedDirection(joint.gesture);
    if (!direction || organism.state === 'sleeping') return;
    const affiliation = affiliationTo(id, joint.speakerId);
    if (
      !affiliation ||
      affiliation.affinity < AFFILIATION_THRESHOLD ||
      affiliation.evidenceStrength < EVIDENCE_THRESHOLD
    ) {
      stats.weakAffiliationPassThroughs++;
      return;
    }

    const duration = Math.max(1, Math.min(
      MAX_COMMITMENT_STEPS,
      1 + Math.floor(
        ph.coordinationPersistence * 3 +
        clamp(affiliation.affinity) * 2 +
        clamp(affiliation.evidenceStrength) * 1.5
      )
    ));
    const strength = clamp(
      0.18 +
      ph.affiliateResponsiveness * 0.30 +
      clamp(affiliation.affinity) * 0.34 +
      clamp(affiliation.evidenceStrength) * 0.16
    );

    state.commitment = {
      speakerId:joint.speakerId,
      referent:joint.referent || null,
      modifier:joint.modifier || null,
      direction,
      affinity:affiliation.affinity,
      evidenceStrength:affiliation.evidenceStrength,
      strength,
      totalSteps:duration,
      remainingSteps:duration,
      sourceJointAttentionStep:joint.step,
      createdAtStep:stepCount,
    };
    stats.affiliateCommitmentsStarted++;
  }

  function applyCommitment(id, organism, state, ph) {
    const commitment = state.commitment;
    if (!commitment) return;
    if (organism.state === 'sleeping') {
      state.commitment = null;
      return;
    }
    if (urgentLocalNeed(organism)) {
      state.lastAppliedCommitment = {
        speakerId:commitment.speakerId,
        interrupted:true,
        reason:'urgent-local-need',
        step:stepCount,
      };
      state.commitment = null;
      stats.commitmentsInterruptedByUrgentNeed++;
      return;
    }

    const vel = velocity.get(id);
    if (!vel) {
      state.commitment = null;
      return;
    }

    const strength = clamp(commitment.strength);
    const blend = 0.92 - strength * 0.12;
    const speed = ph.locomotorSpeed * (0.46 + strength * 0.28);
    const velocityBefore = { vx:vel.vx, vy:vel.vy };
    const directionalVelocityBefore =
      velocityBefore.vx * commitment.direction.x + velocityBefore.vy * commitment.direction.y;
    vel.vx = vel.vx * blend + commitment.direction.x * speed * (1 - blend);
    vel.vy = vel.vy * blend + commitment.direction.y * speed * (1 - blend);
    const velocityAfter = { vx:vel.vx, vy:vel.vy };
    const directionalVelocityAfter =
      velocityAfter.vx * commitment.direction.x + velocityAfter.vy * commitment.direction.y;
    commitment.remainingSteps--;
    state.lastAppliedCommitment = {
      speakerId:commitment.speakerId,
      direction:{ ...commitment.direction },
      strength,
      velocityBefore,
      velocityAfter,
      directionalVelocityBefore,
      directionalVelocityAfter,
      directionalVelocityDelta:directionalVelocityAfter - directionalVelocityBefore,
      remainingSteps:Math.max(0, commitment.remainingSteps),
      interrupted:false,
      step:stepCount,
    };
    stats.commitmentsApplied++;

    if (commitment.remainingSteps <= 0) {
      state.commitment = null;
      stats.commitmentsCompleted++;
    }
  }

  function coordinationStep() {
    let active = 0;
    let coordinating = 0;
    let persistenceSum = 0;
    let responsivenessSum = 0;
    let population = 0;
    const lineages = new Set();

    for (const [id, organism] of motile.entries()) {
      const ph = phenotype(organism.genome);
      const state = ensureState(organism, ph);
      observeJointAttention(id, organism, state, ph);
      applyCommitment(id, organism, state, ph);
      if (state.commitment) active++;
      if (state.lastAppliedCommitment && !state.lastAppliedCommitment.interrupted) {
        coordinating++;
        lineages.add(organism.lineageId);
      }
      persistenceSum += ph.coordinationPersistence;
      responsivenessSum += ph.affiliateResponsiveness;
      population++;
    }

    stepCount++;
    stats.steps = stepCount;
    stats.activeCommitments = active;
    stats.coordinatingOrganisms = coordinating;
    stats.coordinatingLineages = lineages.size;
    stats.meanCoordinationPersistence = population ? persistenceSum / population : 0;
    stats.meanAffiliateResponsiveness = population ? responsivenessSum / population : 0;
  }

  const previousStep = modules.step.bind(modules);
  modules.step = function v63CoalitionJointActionStep(dt) {
    const result = previousStep(dt);
    accumulator += Number(dt) || 0;
    if (accumulator >= STEP_SECONDS) {
      accumulator = 0;
      coordinationStep();
    }
    return result;
  };

  function copyApplied(applied) {
    if (!applied) return null;
    return {
      ...applied,
      direction:applied.direction ? { ...applied.direction } : undefined,
      velocityBefore:applied.velocityBefore ? { ...applied.velocityBefore } : undefined,
      velocityAfter:applied.velocityAfter ? { ...applied.velocityAfter } : undefined,
    };
  }

  const api = {
    installed:true,
    getStats:() => ({
      ...stats,
      installed:true,
      version:'v63a-affiliation-conditioned-joint-action',
      usesObservableV56JointAttentionOnly:true,
      usesOwnV62AffiliationOnly:true,
      noReverseAffiliationInspection:true,
      noCoalitionMembershipLookup:true,
      noHiddenTargetCoordinates:true,
      sustainedResponseAfterPublicSignal:true,
      weakAffiliationPreservesV56Behavior:true,
      urgentLocalNeedsOverrideCommitment:true,
      oneBoundedCommitmentPerOrganism:true,
      maxCommitmentSteps:MAX_COMMITMENT_STEPS,
      affiliationThreshold:AFFILIATION_THRESHOLD,
      evidenceThreshold:EVIDENCE_THRESHOLD,
      authoritativeFixedStep:true,
      noHardPopulationCap:true,
      noHardDisplayCap:true,
      surfaceRendererEnabled:false,
    }),
    getJointAction(id) {
      const state = motile.get(id)?.bioV63;
      if (!state) return null;
      return {
        coordinationPersistence:state.coordinationPersistence,
        affiliateResponsiveness:state.affiliateResponsiveness,
        lastJointAttentionKey:state.lastJointAttentionKey,
        commitment:state.commitment ? {
          ...state.commitment,
          direction:{ ...state.commitment.direction },
        } : null,
        lastAppliedCommitment:copyApplied(state.lastAppliedCommitment),
      };
    },
    getPopulationJointAction() {
      return [...motile.entries()]
        .map(([id, organism]) => ({ id, lineageId:organism.lineageId, jointAction:api.getJointAction(id) }))
        .filter(item => item.jointAction);
    },
  };

  window.realitySandboxCoalitionJointActionV63 = api;
  window.realitySandboxEvolutionBuild = 'evolution-v63-coalition-joint-action';
  document.documentElement.dataset.evolutionBuild = 'evolution-v63-coalition-joint-action';
  document.documentElement.dataset.coalitionJointActionV63 = 'affiliation-conditioned-persistence';
}

waitForRuntime().then(install);
