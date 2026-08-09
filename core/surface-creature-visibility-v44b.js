import * as THREE from 'three';

const TYPE_SCALE = {
  agent: 3.6,
  predator: 4.0,
  apex: 4.6,
};
const TYPE_LIFT = {
  agent: 1.8,
  predator: 2.2,
  apex: 2.8,
};

function creatureType(mesh) {
  const name = String(mesh?.name || '');
  if (!name.startsWith('surfaceCreature-')) return null;
  if (name.includes('-agent-')) return 'agent';
  if (name.includes('-predator-')) return 'predator';
  if (name.includes('-apex-')) return 'apex';
  return null;
}

async function waitForRuntime() {
  for (let i = 0; i < 360; i++) {
    const creatures = window.realitySandboxSurfaceCreaturesV44;
    const objects = window.realitySandboxSurfaceLightHookV36?.getObjects?.();
    if (creatures?.installed && objects?.scene) return { creatures, scene: objects.scene };
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  return null;
}

function install({ scene }) {
  if (window.realitySandboxSurfaceCreatureVisibilityV44b?.installed) return;

  const nativeSetMatrixAt = THREE.InstancedMesh.prototype.setMatrixAt;
  const scratch = new THREE.Matrix4();
  let matricesEnhanced = 0;
  let existingMeshesEnhanced = 0;
  let materialsEnhanced = 0;

  function enhanceMatrix(mesh, matrix) {
    const type = creatureType(mesh);
    if (!type) return matrix;
    scratch.copy(matrix);
    const e = scratch.elements;
    const scale = TYPE_SCALE[type];
    e[0] *= scale; e[1] *= scale; e[2] *= scale;
    e[4] *= scale; e[5] *= scale; e[6] *= scale;
    e[8] *= scale; e[9] *= scale; e[10] *= scale;
    e[13] += TYPE_LIFT[type];
    matricesEnhanced++;
    return scratch;
  }

  THREE.InstancedMesh.prototype.setMatrixAt = function surfaceCreatureVisibleSetMatrixAt(index, matrix) {
    const type = creatureType(this);
    if (!type) return nativeSetMatrixAt.call(this, index, matrix);
    return nativeSetMatrixAt.call(this, index, enhanceMatrix(this, matrix));
  };

  function enhanceMaterial(mesh) {
    const type = creatureType(mesh);
    if (!type || !mesh.material || mesh.userData?.surfaceCreatureVisibilityMaterialV44b) return;
    mesh.userData.surfaceCreatureVisibilityMaterialV44b = true;
    mesh.frustumCulled = false;
    mesh.renderOrder = Math.max(mesh.renderOrder || 0, 5);
    const material = mesh.material;
    if (material.isMeshStandardMaterial) {
      material.emissive = material.emissive || new THREE.Color(0x000000);
      material.emissive.setHex(type === 'predator' ? 0x24110d : type === 'apex' ? 0x13202c : 0x101b13);
      material.emissiveIntensity = type === 'apex' ? 0.42 : 0.30;
      material.roughness = Math.min(material.roughness ?? 1, 0.74);
      material.needsUpdate = true;
    }
    materialsEnhanced++;
  }

  function enhanceExisting() {
    scene.traverse(object => {
      const type = creatureType(object);
      if (!type || !object.isInstancedMesh || object.userData?.surfaceCreatureVisibilityMatricesV44b) {
        if (type) enhanceMaterial(object);
        return;
      }
      object.userData.surfaceCreatureVisibilityMatricesV44b = true;
      enhanceMaterial(object);
      const count = Math.max(0, Number(object.count) || 0);
      for (let i = 0; i < count; i++) {
        object.getMatrixAt(i, scratch);
        nativeSetMatrixAt.call(object, i, enhanceMatrix(object, scratch));
      }
      object.instanceMatrix.needsUpdate = true;
      existingMeshesEnhanced++;
    });
  }

  const nativeSceneAdd = THREE.Scene.prototype.add;
  THREE.Scene.prototype.add = function surfaceCreatureVisibleSceneAdd(...objects) {
    const result = nativeSceneAdd.apply(this, objects);
    for (const object of objects) {
      if (creatureType(object)) {
        enhanceMaterial(object);
        object.userData.surfaceCreatureVisibilityMatricesV44b = true;
      }
    }
    return result;
  };

  enhanceExisting();

  let scans = 0;
  function maintenance() {
    scans++;
    enhanceExisting();
    setTimeout(maintenance, 1200);
  }
  setTimeout(maintenance, 1200);

  const api = {
    installed: true,
    getStats: () => ({
      installed: true,
      presentationOnly: true,
      ecologyUnchanged: true,
      agentScale: TYPE_SCALE.agent,
      predatorScale: TYPE_SCALE.predator,
      apexScale: TYPE_SCALE.apex,
      terrainClearanceLift: true,
      brighterMaterials: true,
      frustumCullingDisabled: true,
      globalDisplayCap: false,
      matricesEnhanced,
      existingMeshesEnhanced,
      materialsEnhanced,
      maintenanceScans: scans,
      additionalDrawCalls: 0,
      renderLoopProceduralSamples: 0,
    }),
  };

  window.realitySandboxSurfaceCreatureVisibilityV44b = api;
  document.documentElement.dataset.surfaceCreatureVisibilityV44b = 'large-readable-low-poly';
  const previous = window.realitySandboxPresentationDiagnostics;
  window.realitySandboxPresentationDiagnostics = () => ({
    ...(typeof previous === 'function' ? previous() : {}),
    surfaceCreatureVisibilityV44b: api.getStats(),
  });
}

waitForRuntime().then(state => {
  if (!state) {
    document.documentElement.dataset.surfaceCreatureVisibilityV44b = 'unavailable';
    return;
  }
  install(state);
});
