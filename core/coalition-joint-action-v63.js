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
  let commitmentModifiers = [];

  const stats = {
    steps:0,
    jointAttentionEventsSeen:0,
    affiliateCommitmentsStarted:0,
    weakAffiliationPassThroughs:0,
    commitmentsApplied:0,
    commitmentsCompleted:0,
    commitmentsInterruptedByUrgentNeed:0,
    commitmentModifierApplications:0,
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
    return Boolean(organism.bioV50?.detectedDanger);
  }

  function affiliationTo(id, speakerId) {
    return coalitions.getAffiliation?.(id)?.affiliations?.[String(speakerId)] || null;
  }

  function applyExternalModifiers(id, joint, affiliation, baseDuration, baseStrength) {
    let duration = baseDuration;
    let strength = baseStrength;
    const contributions = [];

    for (let index = 0; index < commitmentModifiers.length; index++) {
      const modifier = commitmentModifiers[index];
      if (typeof modifier !== 'function') continue;
      const beforeDuration = duration;
      const beforeStrength = strength;
      let durationAdjustment = 0;
      let strengthAdjustment = 0;
      try {
        const result = modifier({
          organismId:id,
          speakerId:joint.speakerId,
          baseDuration,
          baseStrength,
          currentDuration:duration,
          currentStrength:strength,
          maxDuration:MAX_COMMITMENT_STEPS,
          jointAttention:{
            speakerId:joint.speakerId,
            referent:joint.referent || null,
            modifier:joint.modifier || null,
            gesture:{ ...joint.gesture },
            step:joint.step,
          },
          affiliation:{
            affinity:Number(affiliation.affinity) || 0,
            evidenceStrength:Number(affiliation.evidenceStrength) || 0,
          },
        }) || null;
        if (result && Number.isFinite(result.durationAdjustment)) {
          const requested = Math.max(-MAX_COMMITMENT_STEPS, Math.min(MAX_COMMITMENT_STEPS, Math.round(result.durationAdjustment)));
          duration = Math.max(1, Math.min(MAX_COMMITMENT_STEPS, duration + requested));
          durationAdjustment = duration - beforeDuration;
        }
        if (result && Number.isFinite(result.strengthAdjustment)) {
          const requested = Number(result.strengthAdjustment) || 0;
          strength = clamp(strength + requested);
          strengthAdjustment = strength - beforeStrength;
        }
      } catch (_error) {
        duration = beforeDuration;
        strength = beforeStrength;
        durationAdjustment = 0;
        strengthAdjustment = 0;
      }
      if (durationAdjustment !== 0 || Math.abs(strengthAdjustment) > 1e-12) {
        stats.commitmentModifierApplications++;
        contributions.push({ index, durationAdjustment, strengthAdjustment });
      }
    }

    return {
      duration,
      strength,
      durationAdjustment:duration - baseDuration,
      strengthAdjustment:strength - baseStrength,
      modifierContributions:contributions,
    };
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

    const baseDuration = Math.max(1, Math.min(
      MAX_COMMITMENT_STEPS,
      1 + Math.floor(
        ph.coordinationPersistence * 3 +
        clamp(affiliation.affinity) * 2 +
        clamp(affiliation.evidenceStrength) * 1.5
      )
    ));
    const baseStrength = clamp(
      0.18 +
      ph.affiliateResponsiveness * 0.30 +
      clamp(affiliation.affinity) * 0.34 +
      clamp(affiliation.evidenceStrength) * 0.16
    );
    const modified = applyExternalModifiers(id, joint, affiliation, baseDuration, baseStrength);

    state.commitment = {
      speakerId:joint.speakerId,
      referent:joint.referent || null,
      modifier:joint.modifier || null,
      direction,
      affinity:affiliation.affinity,
      evidenceStrength:affiliation.evidenceStrength,
      baseDuration,
      baseStrength,
      durationAdjustment:modified.durationAdjustment,
      strengthAdjustment:modified.strengthAdjustment,
      modifierContributions:modified.modifierContributions.map(item => ({ ...item })),
      strength:modified.strength,
      totalSteps:modified.duration,
      remainingSteps:modified.duration,
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
        sourceJointAttentionStep:commitment.sourceJointAttentionStep,
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
      sourceJointAttentionStep:commitment.sourceJointAttentionStep,
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
    setCommitmentModifier(fn) {
      commitmentModifiers = typeof fn === 'function' ? [fn] : [];
      return commitmentModifiers.length > 0;
    },
    addCommitmentModifier(fn) {
      if (typeof fn !== 'function') return commitmentModifiers.length;
      commitmentModifiers.push(fn);
      return commitmentModifiers.length;
    },
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
      commitmentModifierSupported:true,
      multipleCommitmentModifiersSupported:true,
      commitmentModifierInstalled:commitmentModifiers.length > 0,
      commitmentModifierCount:commitmentModifiers.length,
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
          modifierContributions:state.commitment.modifierContributions?.map(item => ({ ...item })) || [],
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
