async function waitForRuntime() {
  while (true) {
    const origin = window.realitySandboxOriginMotileLifeV47;
    const inspector = window.realitySandboxEvolutionInspectorV47b;
    const morphology = window.realitySandboxEvolutionMorphologyV47c;
    const milestones = window.realitySandboxEvolutionaryMilestonesV47d;
    const population = window.realitySandboxLineagePopulationRecordV47e;
    const deepTime = window.realitySandboxEvolutionDeepTimeV47f;
    const morphogenesis = window.realitySandboxMorphogenesisV48;
    const inheritance = window.realitySandboxMorphogenesisInheritanceCacheV48a;
    const selection = window.realitySandboxMorphogenesisSelectionV48b;
    const history = window.realitySandboxMorphogenesisHistoryV48c;
    const nutrientCycle = window.realitySandboxClosedNutrientCycleV49;
    const sensoryBrains = window.realitySandboxSensoryBrainsV50;
    const socialSignaling = window.realitySandboxSocialSignalingV51;
    const learningMemory = window.realitySandboxLearningMemoryV52;
    const protoCulture = window.realitySandboxProtoCultureV53;
    const protoLanguage = window.realitySandboxProtoLanguageV54;
    const compositionalLanguage = window.realitySandboxCompositionalLanguageV55;
    const communicativeIntent = window.realitySandboxCommunicativeIntentV56;
    const socialModels = window.realitySandboxSocialModelsV57;
    const reciprocalCooperation = window.realitySandboxReciprocalCooperationV58;
    if (
      origin?.installed && inspector?.installed && morphology?.installed && milestones?.installed &&
      population?.installed && deepTime?.installed && morphogenesis?.installed && inheritance?.installed &&
      selection?.installed && history?.installed && nutrientCycle?.installed && sensoryBrains?.installed &&
      socialSignaling?.installed && learningMemory?.installed && protoCulture?.installed && protoLanguage?.installed &&
      compositionalLanguage?.installed && communicativeIntent?.installed && socialModels?.installed &&
      reciprocalCooperation?.installed
    ) {
      return {
        origin, inspector, morphology, milestones, population, deepTime,
        morphogenesis, inheritance, selection, history, nutrientCycle,
        sensoryBrains, socialSignaling, learningMemory, protoCulture,
        protoLanguage, compositionalLanguage, communicativeIntent, socialModels, reciprocalCooperation,
      };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install(parts) {
  if (window.realitySandboxEvolutionDiagnosticsV48d?.installed) return;

  function retiredFaunaModules() {
    return {
      surfaceCreaturesV44:Boolean(window.realitySandboxSurfaceCreaturesV44),
      localFaunaV44d:Boolean(window.realitySandboxSurfaceLocalFaunaV44d),
      creatureVisibilityV44b:Boolean(window.realitySandboxSurfaceCreatureVisibilityV44b),
      creatureReadabilityV44c:Boolean(window.realitySandboxSurfaceCreatureReadabilityV44c),
      faunaGuaranteeV45b:Boolean(window.realitySandboxSurfaceFaunaGuaranteeV45b),
      faunaExactV46d:Boolean(window.realitySandboxSurfaceFaunaExactV46d),
      renderBridgeV46d:Boolean(window.realitySandboxSurfaceRenderBridgeV46d),
    };
  }

  function snapshot() {
    const lineagePhenotypes = parts.morphogenesis.getLineagePhenotypes?.() || [];
    const bodyPlanCounts = {};
    for (const lineage of lineagePhenotypes) {
      const plan = lineage.dominantBodyPlan || 'unknown';
      bodyPlanCounts[plan] = (bodyPlanCounts[plan] || 0) + 1;
    }
    const fauna = retiredFaunaModules();
    const nutrientStats = parts.nutrientCycle.getStats();
    const brainStats = parts.sensoryBrains.getStats();
    const signalStats = parts.socialSignaling.getStats();
    const memoryStats = parts.learningMemory.getStats();
    const cultureStats = parts.protoCulture.getStats();
    const languageStats = parts.protoLanguage.getStats();
    const compositionStats = parts.compositionalLanguage.getStats();
    const intentStats = parts.communicativeIntent.getStats();
    const socialStats = parts.socialModels.getStats();
    const cooperationStats = parts.reciprocalCooperation.getStats();
    return {
      ready:true,
      build:window.realitySandboxSurfaceBuild,
      evolutionBuild:window.realitySandboxEvolutionBuild || 'unknown',
      surfaceFaunaPolicy:document.documentElement.dataset.surfaceFaunaPolicy,
      origin:parts.origin.getStats(),
      inspector:parts.inspector.getStats(),
      schematic:parts.morphology.getStats(),
      milestones:parts.milestones.getStats(),
      populationRecord:parts.population.getStats(),
      deepTime:parts.deepTime.getStats(),
      morphogenesis:parts.morphogenesis.getStats(),
      inheritance:parts.inheritance.getStats(),
      habitatSelection:parts.selection.getStats(),
      bodyPlanHistory:parts.history.getStats(),
      nutrientCycle:nutrientStats,
      sensoryBrains:brainStats,
      socialSignaling:signalStats,
      learningMemory:memoryStats,
      protoCulture:cultureStats,
      protoLanguage:languageStats,
      compositionalLanguage:compositionStats,
      communicativeIntent:intentStats,
      socialModels:socialStats,
      reciprocalCooperation:cooperationStats,
      lineageCounts:{
        total:parts.origin.getLineages().length,
        motile:parts.origin.getLineages().filter(lineage => lineage.type === 'motile').length,
        plant:parts.origin.getLineages().filter(lineage => lineage.type === 'photosynthetic').length,
      },
      lineagePhenotypes,
      bodyPlanCounts,
      retiredFaunaModules:fauna,
      retiredFaunaModulesAbsent:Object.values(fauna).every(value => value === false),
      noHardPopulationCap:
        parts.origin.getStats().hardPopulationCap === false &&
        parts.morphogenesis.getStats().hardPopulationCap === false &&
        parts.inheritance.getStats().hardPopulationCap === false &&
        parts.selection.getStats().hardPopulationCap === false &&
        nutrientStats.hardPopulationCap === false &&
        brainStats.noHardPopulationCap === true &&
        signalStats.noHardPopulationCap === true &&
        memoryStats.noHardPopulationCap === true &&
        cultureStats.noHardPopulationCap === true &&
        languageStats.noHardPopulationCap === true &&
        compositionStats.noHardPopulationCap === true &&
        intentStats.noHardPopulationCap === true &&
        socialStats.noHardPopulationCap === true &&
        cooperationStats.noHardPopulationCap === true,
      surfaceFaunaRendererDisabled:
        parts.origin.getStats().legacyFaunaRendererEnabled === false &&
        parts.morphogenesis.getStats().surfaceRendererEnabled === false &&
        parts.selection.getStats().surfaceRendererEnabled === false &&
        nutrientStats.surfaceRendererEnabled === false &&
        brainStats.surfaceRendererEnabled === false &&
        signalStats.surfaceRendererEnabled === false &&
        memoryStats.surfaceRendererEnabled === false &&
        cultureStats.surfaceRendererEnabled === false &&
        languageStats.surfaceRendererEnabled === false &&
        compositionStats.surfaceRendererEnabled === false &&
        intentStats.surfaceRendererEnabled === false &&
        socialStats.surfaceRendererEnabled === false &&
        cooperationStats.surfaceRendererEnabled === false,
    };
  }

  function invariants() {
    const state = snapshot();
    const failures = [];
    if (!state.retiredFaunaModulesAbsent) failures.push('A retired Surface-fauna experiment is loaded.');
    if (!state.noHardPopulationCap) failures.push('An evolution module reports a hard population cap.');
    if (!state.surfaceFaunaRendererDisabled) failures.push('A v47-v58 fauna renderer is unexpectedly enabled.');
    if (!state.origin.plantFirstOrigin) failures.push('Plant-first origin mode is inactive.');
    if (
      !state.origin.authoritativeFixedStep || !state.morphogenesis.authoritativeFixedStep ||
      !state.inheritance.authoritativeFixedStep || !state.habitatSelection.authoritativeFixedStep ||
      !state.bodyPlanHistory.authoritativeFixedStep || !state.nutrientCycle.authoritativeFixedStep ||
      !state.sensoryBrains.authoritativeFixedStep || !state.socialSignaling.authoritativeFixedStep ||
      !state.learningMemory.authoritativeFixedStep || !state.protoCulture.authoritativeFixedStep ||
      !state.protoLanguage.authoritativeFixedStep || !state.compositionalLanguage.authoritativeFixedStep ||
      !state.communicativeIntent.authoritativeFixedStep || !state.socialModels.authoritativeFixedStep ||
      !state.reciprocalCooperation.authoritativeFixedStep
    ) failures.push('An evolution subsystem is outside the authoritative fixed step.');
    if (state.morphogenesis.traits?.length !== 9) failures.push('v48 developmental trait schema is incomplete.');
    if (state.inheritance.birthInheritanceComplexity !== 'O(1)') failures.push('v48 developmental inheritance is not using the O(1) lineage cache.');
    if (!state.deepTime.reducedOrderEvolutionaryTime) failures.push('Evolutionary deep-time scaling is inactive.');
    if (state.evolutionBuild !== 'evolution-v58-reciprocal-cooperation') failures.push(`Unexpected evolution build ${state.evolutionBuild}.`);

    if (!state.nutrientCycle.detritusToSoil || !state.nutrientCycle.metabolicWasteToSoil || !state.nutrientCycle.soilToPlantBiomass || !state.nutrientCycle.weatheringAndLeaching || !state.nutrientCycle.toxinSoilFeedback) failures.push('The v49 closed nutrient cycle is incomplete.');
    if (!Number.isFinite(state.nutrientCycle.meanNutrient) || state.nutrientCycle.meanNutrient < 0) failures.push('The v49 nutrient field is invalid.');

    if (!state.sensoryBrains.heritableBehaviorFromGenome || !state.sensoryBrains.competingBehavioralDrives || !state.sensoryBrains.spatialHashing) failures.push('The v50 sensory-brain phenotype is incomplete.');
    if (!Array.isArray(state.sensoryBrains.behaviorModes) || state.sensoryBrains.behaviorModes.length !== 7) failures.push('The v50 behavioral mode schema is incomplete.');

    if (!state.socialSignaling.inheritedSignalPropensity || !state.socialSignaling.kinRestrictedSignals || !state.socialSignaling.alarmCommunication || !state.socialSignaling.foodCommunication || !state.socialSignaling.packHuntCommunication || !state.socialSignaling.spatialHashing) failures.push('The v51 social-signaling phenotype is incomplete.');

    if (!state.learningMemory.inheritedLearningRate || !state.learningMemory.inheritedMemoryRetention || !state.learningMemory.directExperienceLearning || !state.learningMemory.sociallyTransferredMemory || !state.learningMemory.rewardReinforcement || !state.learningMemory.memoryDecay || !state.learningMemory.constantMemoryPerOrganism || state.learningMemory.populationComplexity !== 'O(N)') failures.push('The v52 learning-memory phenotype is incomplete.');

    if (!state.protoCulture.nonGeneticTransmission || !state.protoCulture.physicallyLocalObservation || !state.protoCulture.kinBiasedTransmission || !state.protoCulture.culturallyBlankNewborns || !state.protoCulture.learnedTraditionsAffectBehavior || !state.protoCulture.intergenerationalSocialLearning || !state.protoCulture.spatialHashing) failures.push('The v53 proto-culture phenotype is incomplete.');
    if (!Array.isArray(state.protoCulture.practiceTypes) || state.protoCulture.practiceTypes.length !== 3) failures.push('The v53 cultural-practice schema is incomplete.');

    if (!state.protoLanguage.semanticallyNeutralTokens || !state.protoLanguage.meaningAcquiredByAssociation || !state.protoLanguage.learnedSymbolMeanings || !state.protoLanguage.receiverGroundedAssociations || !state.protoLanguage.noSpeakerMeaningMetadata || !state.protoLanguage.retainedCulturalKnowledgeCanBeReferenced || !state.protoLanguage.physicallyLocalTransmission || !state.protoLanguage.kinBiasedTransmission || !state.protoLanguage.culturallyBlankLexiconAtBirth || !state.protoLanguage.learnedConventionsCanBeProduced || !state.protoLanguage.symbolUseAffectsBehavior || !state.protoLanguage.boundedLexicon || !state.protoLanguage.spatialHashing) failures.push('The v54 receiver-grounded proto-language phenotype is incomplete.');
    if (state.protoLanguage.version !== 'v54b-receiver-grounded') failures.push(`Unexpected v54 language version ${state.protoLanguage.version || 'unknown'}.`);
    if (!Array.isArray(state.protoLanguage.tokenInventory) || state.protoLanguage.tokenInventory.length !== state.protoLanguage.maxLexiconEntries) failures.push('The v54 symbol inventory/lexicon bound is invalid.');
    if (!Array.isArray(state.protoLanguage.meaningTypes) || state.protoLanguage.meaningTypes.length !== 3) failures.push('The v54 learned-meaning schema is incomplete.');

    if (!state.compositionalLanguage.independentPrimitiveMeanings || !state.compositionalLanguage.compositionalGeneralization || !state.compositionalLanguage.learnedWordOrder || !state.compositionalLanguage.wordOrderConstrainsDecoding || !state.compositionalLanguage.syntaxLearnedFromObservedSequence || !state.compositionalLanguage.holophraseReanalysis || !state.compositionalLanguage.receiverGroundedPrimitiveLearning || !state.compositionalLanguage.receiverKnownHolophraseAnchors || !state.compositionalLanguage.reanalysisWithoutCurrentContext || !state.compositionalLanguage.rootAnchoredSyntaxLearning || !state.compositionalLanguage.noSpeakerSemanticMetadata || !state.compositionalLanguage.retainedCulturalKnowledgeCanBeComposed || !state.compositionalLanguage.culturallyBlankCompositionalLexiconAtBirth || !state.compositionalLanguage.nonGeneticCompositionalTransmission || !state.compositionalLanguage.physicallyLocalTransmission || !state.compositionalLanguage.kinBiasedTransmission || !state.compositionalLanguage.boundedPrimitiveLexicon || !state.compositionalLanguage.constantPairMemory || !state.compositionalLanguage.spatialHashing) failures.push('The v55 known-holophrase compositional phenotype is incomplete.');
    if (state.compositionalLanguage.version !== 'v55c-known-holophrase-reanalysis') failures.push(`Unexpected v55 language version ${state.compositionalLanguage.version || 'unknown'}.`);
    if (!Array.isArray(state.compositionalLanguage.primitiveInventory) || state.compositionalLanguage.primitiveInventory.length !== 6) failures.push('The v55 primitive inventory is invalid.');
    if (!Array.isArray(state.compositionalLanguage.referentTypes) || state.compositionalLanguage.referentTypes.length !== 3 || !Array.isArray(state.compositionalLanguage.modifierTypes) || state.compositionalLanguage.modifierTypes.length !== 3 || state.compositionalLanguage.maxPairSpace !== 9) failures.push('The v55 compositional pair space is invalid.');

    if (
      !state.communicativeIntent.audienceDirectedCommunication ||
      !state.communicativeIntent.communicativeSuccessReinforcement ||
      !state.communicativeIntent.listenerBehaviorFeedback ||
      !state.communicativeIntent.decodedResponseRequiredForSuccess ||
      !state.communicativeIntent.outcomeBiasedCommunicationChoice ||
      !state.communicativeIntent.failedActsCanBeSuppressed ||
      !state.communicativeIntent.staleUtteranceContextRejected ||
      !state.communicativeIntent.deicticJointAttention ||
      !state.communicativeIntent.observableGestureDirection ||
      !state.communicativeIntent.noHiddenTargetCoordinates ||
      !state.communicativeIntent.requiresLearnedV55Decoding ||
      !state.communicativeIntent.noSpeakerSemanticMetadata ||
      !state.communicativeIntent.physicallyLocalTransmission ||
      !state.communicativeIntent.kinBiasedTransmission ||
      !state.communicativeIntent.boundedIntentMemory ||
      !state.communicativeIntent.spatialHashing
    ) failures.push('The v56 outcome-biased communicative-intent phenotype is incomplete.');
    if (state.communicativeIntent.version !== 'v56b-outcome-biased-communicative-intent') failures.push(`Unexpected v56 intent version ${state.communicativeIntent.version || 'unknown'}.`);
    if (!Array.isArray(state.communicativeIntent.pairSpace) || state.communicativeIntent.pairSpace.length !== 9 || state.communicativeIntent.maxIntentEntries !== 9) failures.push('The v56 bounded communicative pair space is invalid.');

    if (
      !state.socialModels.individualPartnerModels ||
      !state.socialModels.evidenceFromOwnInteractionsOnly ||
      !state.socialModels.noPrivateStateInspection ||
      !state.socialModels.learnedPartnerResponsiveness ||
      !state.socialModels.speakerReliabilityFromOwnConsequences ||
      !state.socialModels.inferredPartnerKnowledgeRequiresObservedOutcome ||
      !state.socialModels.trustNotGrantedByDecodeAlone ||
      !state.socialModels.socialModelsBiasAudienceSelection ||
      !state.socialModels.selectiveSocialAttention ||
      !state.socialModels.socialModelsAffectBehavior ||
      !state.socialModels.boundedPartnerModels ||
      !state.socialModels.spatialHashing
    ) failures.push('The v57 observed-outcome social-model phenotype is incomplete.');
    if (state.socialModels.version !== 'v57b-observed-outcome-social-models') failures.push(`Unexpected v57 social-model version ${state.socialModels.version || 'unknown'}.`);
    if (state.socialModels.maxPartnerModels !== 8) failures.push('The v57 per-organism partner-model bound is invalid.');
    if (!Array.isArray(state.socialModels.partnerKnowledgeDimensions) || state.socialModels.partnerKnowledgeDimensions.length !== 3) failures.push('The v57 inferred partner-knowledge schema is invalid.');

    if (
      !state.reciprocalCooperation.publicNeedSolicitation ||
      !state.reciprocalCooperation.noHiddenRecipientNeedInspection ||
      !state.reciprocalCooperation.aidDecisionUsesOwnSocialModel ||
      !state.reciprocalCooperation.recipientEnergyNotUsedForChoice ||
      !state.reciprocalCooperation.reciprocalHistoryBiasesAid ||
      !state.reciprocalCooperation.costlyHelping ||
      !state.reciprocalCooperation.energyConservingTransfer ||
      !state.reciprocalCooperation.boundedPartnerLedger ||
      !state.reciprocalCooperation.physicallyLocalAid ||
      !state.reciprocalCooperation.kinBiasedAid ||
      !state.reciprocalCooperation.spatialHashing
    ) failures.push('The v58 reciprocal-cooperation phenotype is incomplete.');
    if (state.reciprocalCooperation.version !== 'v58a-conserved-reciprocal-aid') failures.push(`Unexpected v58 cooperation version ${state.reciprocalCooperation.version || 'unknown'}.`);
    if (state.reciprocalCooperation.maxPartnerLedgers !== 8) failures.push('The v58 reciprocal partner-ledger bound is invalid.');
    if (Math.abs((state.reciprocalCooperation.transferEfficiency || 0) - 0.86) > 1e-12) failures.push('The v58 aid-transfer efficiency is invalid.');
    const aidBalance = Math.abs(
      (state.reciprocalCooperation.energyDebited || 0) -
      (state.reciprocalCooperation.energyReceived || 0) -
      (state.reciprocalCooperation.metabolicAidCost || 0)
    );
    if (aidBalance > 1e-8) failures.push(`The v58 aid-energy ledger is not conserved (${aidBalance}).`);

    return { ok:failures.length === 0, failures, snapshot:state };
  }

  const api = { installed:true, snapshot, invariants };
  window.realitySandboxEvolutionDiagnosticsV48d = api;
  document.documentElement.dataset.evolutionDiagnosticsV48d = 'ready-v58a-reciprocal-cooperation';

  if (window.realitySandboxDebug && typeof window.realitySandboxDebug === 'object') {
    window.realitySandboxDebug.evolution = snapshot;
    window.realitySandboxDebug.evolutionInvariants = invariants;
  }

  const previousPresentationDiagnostics = window.realitySandboxPresentationDiagnostics;
  window.realitySandboxPresentationDiagnostics = () => ({
    ...(typeof previousPresentationDiagnostics === 'function' ? previousPresentationDiagnostics() : {}),
    evolutionV58:snapshot(),
  });
}

waitForRuntime().then(install);
