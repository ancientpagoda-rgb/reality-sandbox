import * as THREE from 'three';

// Strong isolation build: while Surface Mode is active this module removes
// simulation, procedural sampling, ecology, terrain generation, water, weather,
// vegetation and creatures from the hot path. The visible scene is deliberately
// just a few static GPU meshes. If this still stutters, the bottleneck is outside
// the simulated world and points at the browser/WebGL/driver/compositor path.
window.realitySandboxSurfaceFlatDiagnostic = { enabled: true, installed: false };
document.documentElement.dataset.surfaceFlatDiagnostic = 'booting';

const FLAT_TERRAIN = Object.freeze({
  land: true,
  elevation: 0.53,
  biome: 'diagnostic-flat',
  temperature: 18,
  moisture: 0.5,
  fertility: 0.5,
});
const FLAT_WATER = Object.freeze({
  rain: 0,
  lake: 0,
  river: 0,
  snowpack: 0,
  groundwater: 0,
});

async function waitForRuntime() {
  for (let attempt = 0; attempt < 300; attempt++) {
    const planet = window.realitySandboxPlanet;
    const modules = window.realitySandboxModules;
    const mode = window.realitySandboxSurfaceMode;
    const layer = document.getElementById('surfaceModeLayer');
    const inputCanvas = document.getElementById('surfaceModeCanvas');
    if (
      planet?.world &&
      planet?.living?.sampleDynamicPlanet &&
      planet?.waterCycle?.sample &&
      modules?.step &&
      mode?.getPlayer &&
      mode?.isActive &&
      layer &&
      inputCanvas
    ) return { planet, modules, mode, layer, inputCanvas };
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  return null;
}

function install({ planet, modules, mode, layer, inputCanvas }) {
  if (window.realitySandboxSurfaceFlatDiagnostic?.installed) return;

  const { world, living, waterCycle } = planet;
  const stats = {
    frames: 0,
    activeFrames: 0,
    worldStepsSuppressed: 0,
    moduleStepsSuppressed: 0,
    terrainSamplesSuppressed: 0,
    waterSamplesSuppressed: 0,
    contextLost: false,
  };
  const surfaceActive = () => Boolean(
    mode.isActive?.() && document.documentElement.dataset.surfaceMode === 'active'
  );

  // Stop the authoritative simulation before it reaches world/entity work.
  const previousBudget = world.getSphericalStepDt;
  world.getSphericalStepDt = function flatDiagnosticWorldBudget(dt) {
    if (surfaceActive()) {
      stats.worldStepsSuppressed++;
      return false;
    }
    return typeof previousBudget === 'function' ? previousBudget.call(world, dt) : dt;
  };

  // app-seeded calls moduleHost.step even when stepSphere returns false.
  // Suppress every simulation module while this diagnostic owns Surface Mode.
  const nativeModuleStep = modules.step.bind(modules);
  modules.step = function flatDiagnosticModuleStep(dt) {
    if (surfaceActive()) {
      stats.moduleStepsSuppressed++;
      return;
    }
    return nativeModuleStep(dt);
  };

  // The controller HUD normally samples procedural terrain/water several times
  // per second. Replace those calls with constants too, so this really is a
  // zero-procedural-sampling surface test.
  const nativeTerrainSample = living.sampleDynamicPlanet.bind(living);
  const nativeWaterSample = waterCycle.sample.bind(waterCycle);
  living.sampleDynamicPlanet = function flatDiagnosticTerrainSample(x, y, ...rest) {
    if (surfaceActive() && rest.length === 0) {
      stats.terrainSamplesSuppressed++;
      return FLAT_TERRAIN;
    }
    return nativeTerrainSample(x, y, ...rest);
  };
  waterCycle.sample = function flatDiagnosticWaterSample(x, y, ...rest) {
    if (surfaceActive() && rest.length === 0) {
      stats.waterSamplesSuppressed++;
      return FLAT_WATER;
    }
    return nativeWaterSample(x, y, ...rest);
  };

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      alpha: false,
      antialias: false,
      powerPreference: 'high-performance',
      depth: true,
      stencil: false,
    });
  } catch (error) {
    document.documentElement.dataset.surfaceGpu = 'flat-webgl-unavailable';
    document.documentElement.dataset.surfaceFlatDiagnostic = 'webgl-unavailable';
    return;
  }

  renderer.setPixelRatio(1);
  renderer.setClearColor(0x7fa0b2, 1);
  renderer.domElement.id = 'surfaceGpuCanvas';
  renderer.domElement.setAttribute('aria-label', 'Flat GPU diagnostic surface view');
  Object.assign(renderer.domElement.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    display: 'none',
    zIndex: '0',
    pointerEvents: 'none',
  });
  layer.prepend(renderer.domElement);
  inputCanvas.style.zIndex = '1';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x7fa0b2);
  scene.fog = new THREE.Fog(0x7fa0b2, 250, 1800);

  const camera = new THREE.PerspectiveCamera(100, 1, 0.1, 2500);
  camera.rotation.order = 'YXZ';

  const hemi = new THREE.HemisphereLight(0xffffff, 0x334433, 2.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(100, 180, 80);
  scene.add(sun);

  // One giant plane + a tiny number of static reference objects. No generated
  // terrain, no textures, no instances, no world queries.
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(5000, 5000, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x527a55, roughness: 1, metalness: 0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  scene.add(floor);

  const grid = new THREE.GridHelper(5000, 100, 0x203020, 0x3f6545);
  grid.position.y = 0.03;
  scene.add(grid);

  const markerGeometry = new THREE.BoxGeometry(10, 24, 10);
  const markerMaterial = new THREE.MeshStandardMaterial({ color: 0xd8c078, roughness: 0.8 });
  for (let z = -300; z <= 300; z += 100) {
    for (let x = -300; x <= 300; x += 100) {
      if (x === 0 && z === 0) continue;
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.set(x, 12, z);
      scene.add(marker);
    }
  }

  let lastWidth = 0;
  let lastHeight = 0;
  function resize() {
    const rect = layer.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (width === lastWidth && height === lastHeight) return;
    lastWidth = width;
    lastHeight = height;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function isPresenting() {
    return surfaceActive() && !stats.contextLost;
  }

  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    stats.contextLost = true;
    document.documentElement.dataset.surfaceGpu = 'flat-context-lost';
  }, false);
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    stats.contextLost = false;
  }, false);

  function loop() {
    requestAnimationFrame(loop);
    stats.frames++;
    if (!surfaceActive()) {
      renderer.domElement.style.display = 'none';
      return;
    }
    stats.activeFrames++;
    renderer.domElement.style.display = 'block';
    inputCanvas.style.opacity = '0';
    resize();

    const player = mode.getPlayer();
    // Keep coordinates bounded while preserving movement sensation.
    const px = ((player.x % 600) + 600) % 600 - 300;
    const pz = ((player.y % 600) + 600) % 600 - 300;
    camera.position.set(px, Math.max(4, player.altitude || 4), pz);
    camera.rotation.y = -(player.yaw || 0) - Math.PI * 0.5;
    camera.rotation.x = player.pitch || 0;
    renderer.render(scene, camera);
    document.documentElement.dataset.surfaceGpu = 'active';
    document.documentElement.dataset.surfaceModeVisibleCreatures = '0';
  }
  requestAnimationFrame(loop);

  const gpuApi = {
    installed: true,
    isPresenting,
    getStats: () => ({
      renderer: 'WebGLRenderer',
      gpuPrimary: true,
      active: isPresenting(),
      diagnosticScene: 'single-flat-plane',
      frames: stats.frames,
      activeFrames: stats.activeFrames,
      rendererInfo: {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        points: renderer.info.render.points,
        lines: renderer.info.render.lines,
      },
    }),
  };
  window.realitySandboxSurfaceGpu = gpuApi;

  const api = {
    enabled: true,
    installed: true,
    getStats: () => ({
      ...stats,
      surfaceActive: surfaceActive(),
      scene: 'single-flat-plane',
      proceduralSampling: false,
      simulationRunning: !surfaceActive(),
      destructive: false,
    }),
  };
  window.realitySandboxSurfaceFlatDiagnostic = api;
  document.documentElement.dataset.surfaceFlatDiagnostic = 'single-flat-plane';

  const previousDiagnostics = window.realitySandboxPresentationDiagnostics;
  window.realitySandboxPresentationDiagnostics = () => ({
    ...(typeof previousDiagnostics === 'function' ? previousDiagnostics() : {}),
    surfaceGpu: gpuApi.getStats(),
    surfaceFlatDiagnostic: api.getStats(),
  });
}

async function boot() {
  const state = await waitForRuntime();
  if (!state) {
    document.documentElement.dataset.surfaceFlatDiagnostic = 'unavailable';
    return;
  }
  install(state);
}

boot();
