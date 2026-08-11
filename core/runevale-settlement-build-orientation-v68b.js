async function waitForSettlement() {
  for (let attempt = 0; attempt < 300; attempt++) {
    const settlement = window.realitySandboxRunevaleSettlementV68;
    if (settlement?.installed && typeof settlement.getState === 'function') return settlement;
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  return null;
}

function install(settlement) {
  if (window.realitySandboxRunevaleBuildOrientationV68b?.installed) return;

  const rawGetState = settlement.getState.bind(settlement);
  const rawGetStats = settlement.getStats.bind(settlement);
  const LINEAR_TYPES = new Set(['palisade','gatehouse']);

  settlement.getState = function v68PresentationOrientedState() {
    const state = rawGetState();
    for (const structure of state.structures || []) {
      if (!LINEAR_TYPES.has(structure.type)) continue;
      structure.modelRotation = Number(structure.rotation) || 0;
      structure.rotation = structure.modelRotation + Math.PI * 0.5;
      structure.linearBuildOrientation = 'perpendicular-to-placement-direction';
    }
    return state;
  };

  settlement.getStats = () => ({
    ...rawGetStats(),
    linearFortificationsSpanAcrossBuildDirection:true,
    linearFortificationRotationOffsetRadians:Math.PI * 0.5,
    linearFortificationTypes:[...LINEAR_TYPES],
  });

  const api = {
    installed:true,
    version:'v68b-linear-fortification-orientation',
    linearTypes:[...LINEAR_TYPES],
    rotationOffsetRadians:Math.PI * 0.5,
    rawState:rawGetState,
  };

  window.realitySandboxRunevaleBuildOrientationV68b = api;
  document.documentElement.dataset.runevaleBuildOrientationV68b = 'linear-fortifications-perpendicular';
}

waitForSettlement().then(settlement => {
  if (!settlement) {
    document.documentElement.dataset.runevaleBuildOrientationV68b = 'unavailable';
    return;
  }
  install(settlement);
});
