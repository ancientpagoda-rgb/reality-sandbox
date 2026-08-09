import * as THREE from 'three';

(() => {
  if (window.realitySandboxSurfaceRenderBridgeV46d?.installed) return;

  const state = {
    renderer: null,
    scene: null,
    camera: null,
    captures: 0,
    activeCaptures: 0,
  };

  const nativeRender = THREE.WebGLRenderer.prototype.render;
  THREE.WebGLRenderer.prototype.render = function captureExactSurfaceRender(scene, camera) {
    if (this?.domElement?.id === 'surfaceGpuCanvas') {
      state.renderer = this;
      state.scene = scene;
      state.camera = camera;
      state.captures++;
      if (document.documentElement.dataset.surfaceMode === 'active') state.activeCaptures++;
    }
    return nativeRender.call(this, scene, camera);
  };

  const api = {
    installed: true,
    getObjects: () => state,
    getStats: () => ({
      installed: true,
      exactSurfaceCanvasCapture: true,
      rendererCaptured: Boolean(state.renderer),
      sceneCaptured: Boolean(state.scene),
      cameraCaptured: Boolean(state.camera),
      captures: state.captures,
      activeCaptures: state.activeCaptures,
      canvasId: state.renderer?.domElement?.id || null,
    }),
  };

  window.realitySandboxSurfaceRenderBridgeV46d = api;
  document.documentElement.dataset.surfaceRenderBridgeV46d = 'waiting-for-surfaceGpuCanvas';

  const previousDiagnostics = window.realitySandboxPresentationDiagnostics;
  window.realitySandboxPresentationDiagnostics = () => ({
    ...(typeof previousDiagnostics === 'function' ? previousDiagnostics() : {}),
    surfaceRenderBridgeV46d: api.getStats(),
  });

  function mark() {
    requestAnimationFrame(mark);
    if (state.renderer && state.scene && state.camera) {
      document.documentElement.dataset.surfaceRenderBridgeV46d = 'exact-surfaceGpuCanvas-captured';
    }
  }
  requestAnimationFrame(mark);
})();