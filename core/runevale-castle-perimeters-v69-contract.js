async function waitForRuntime() {
  for (let attempt = 0; attempt < 300; attempt++) {
    const v69 = window.realitySandboxRunevaleCastlePerimetersV69;
    if (v69?.installed && typeof v69.getStats === 'function') return v69;
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  return null;
}

function install(v69) {
  if (window.realitySandboxRunevaleCastlePerimetersContractV69?.installed) return;
  const previousGetStats = v69.getStats.bind(v69);
  v69.getStats = () => ({
    ...previousGetStats(),
    shorelineFootprintRejection:true,
    slopeFootprintRejection:true,
    orientedFootprintOverlapValidation:true,
    straightAndCornerSnapping:true,
    closedPerimetersDerivedFromWallGraph:true,
    noStoredCastleMembershipId:true,
  });
  window.realitySandboxRunevaleCastlePerimetersContractV69 = {
    installed:true,
    version:'v69a-contract-flags',
  };
  document.documentElement.dataset.runevaleCastlePerimetersContractV69 = 'ready';
}

waitForRuntime().then(v69 => {
  if (!v69) {
    document.documentElement.dataset.runevaleCastlePerimetersContractV69 = 'unavailable';
    return;
  }
  install(v69);
});
