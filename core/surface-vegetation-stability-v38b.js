(() => {
  if (window.realitySandboxSurfaceVegetationStabilityV38b?.installed) return;

  const stats = {
    frames: 0,
    groupFixes: 0,
    anchorHandoffs: 0,
    cullingDisabledMeshes: 0,
  };

  const wrap = (v, max) => ((v % max) + max) % max;
  function shortestWrappedDelta(value, origin, size) {
    let delta = value - origin;
    if (delta > size * 0.5) delta -= size;
    else if (delta < -size * 0.5) delta += size;
    return delta;
  }

  async function waitForRuntime() {
    for (let i = 0; i < 320; i++) {
      const planet = window.realitySandboxPlanet;
      const surface = window.realitySandboxSurfaceSphereV37;
      const vegetation = window.realitySandboxSurfaceVegetationV38;
      const scene = window.realitySandboxSurfaceLightHookV36?.getObjects?.().scene;
      if (planet?.world && surface?.getStats && vegetation?.getStats && scene) return { planet, surface, vegetation, scene };
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    return null;
  }

  function install({ planet, surface, vegetation, scene }) {
    const { world } = planet;
    let lastSurfaceKey = '';

    function anchorForKey(key, stride) {
      const parts = String(key || '').split(':').map(Number);
      if (parts.length !== 2 || !parts.every(Number.isFinite)) return null;
      return {
        x: wrap((parts[0] + 0.5) * stride, world.width),
        y: Math.max(0, Math.min(world.height, (parts[1] + 0.5) * stride)),
      };
    }

    function loop() {
      requestAnimationFrame(loop);
      stats.frames++;
      if (document.documentElement.dataset.surfaceMode !== 'active') return;

      const surfaceStats = surface.getStats();
      const vegetationStats = vegetation.getStats();
      const group = scene.getObjectByName?.('surfaceVegetationV38');
      if (!group) return;

      for (const child of group.children || []) {
        if (child?.isInstancedMesh && child.frustumCulled !== false) {
          child.frustumCulled = false;
          stats.cullingDisabledMeshes++;
        }
      }

      const surfaceKey = surfaceStats.activeChunkKey;
      const vegetationKey = vegetationStats.activeChunkKey;
      const stride = surfaceStats.chunkStride;
      if (!surfaceKey || !vegetationKey || !stride) return;

      const surfaceAnchor = anchorForKey(surfaceKey, stride);
      const vegetationAnchor = anchorForKey(vegetationKey, stride);
      if (!surfaceAnchor || !vegetationAnchor) return;

      const dx = shortestWrappedDelta(vegetationAnchor.x, surfaceAnchor.x, world.width);
      const dz = vegetationAnchor.y - surfaceAnchor.y;
      if (Math.abs(group.position.x - dx) > 0.001 || Math.abs(group.position.z - dz) > 0.001) {
        group.position.x = dx;
        group.position.z = dz;
        group.updateMatrixWorld?.();
        stats.groupFixes++;
      }
      if (surfaceKey !== lastSurfaceKey) {
        if (lastSurfaceKey) stats.anchorHandoffs++;
        lastSurfaceKey = surfaceKey;
      }
    }
    requestAnimationFrame(loop);

    const api = {
      installed: true,
      getStats: () => ({
        ...stats,
        preservesOldVegetationDuringRebuild: true,
        anchorRegistered: true,
        instancedFrustumCullingDisabled: true,
      }),
    };
    window.realitySandboxSurfaceVegetationStabilityV38b = api;
    document.documentElement.dataset.surfaceVegetationStabilityV38b = 'anchor-registered-no-popout';

    const previousDiagnostics = window.realitySandboxPresentationDiagnostics;
    window.realitySandboxPresentationDiagnostics = () => ({
      ...(typeof previousDiagnostics === 'function' ? previousDiagnostics() : {}),
      surfaceVegetationStabilityV38b: api.getStats(),
    });
  }

  waitForRuntime().then(state => {
    if (!state) {
      document.documentElement.dataset.surfaceVegetationStabilityV38b = 'unavailable';
      return;
    }
    install(state);
  });
})();
