import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const BUILD = 'surface-plants-v74-kenney-cc0';
const REBUILD_MS = 1100;
const FRONT_DOT = 0.015;
const MOBILE_LIMIT = 150;
const DESKTOP_LIMIT = 320;
const GLOBE_LIFT = 1.008;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const wrap01 = value => ((value % 1) + 1) % 1;

function hashString(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalFor(x, y) {
  const lon = (wrap01(x) - 0.5) * Math.PI * 2;
  const lat = (0.5 - clamp(y, 0, 1)) * Math.PI;
  const cosLat = Math.cos(lat);
  return new THREE.Vector3(cosLat * Math.sin(lon), Math.sin(lat), cosLat * Math.cos(lon));
}

function cameraFrame(camera) {
  const center = normalFor(camera.centerX, camera.centerY);
  const lon = (wrap01(camera.centerX) - 0.5) * Math.PI * 2;
  const lat = (0.5 - clamp(camera.centerY, 0, 1)) * Math.PI;
  const north = new THREE.Vector3(-Math.sin(lat) * Math.sin(lon), Math.cos(lat), -Math.sin(lat) * Math.cos(lon)).normalize();
  return { center, north };
}

function normalizeModel(scene) {
  const content = scene.clone(true);
  const box = new THREE.Box3().setFromObject(content);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const height = Math.max(size.y, 1e-5);
  content.position.set(-center.x, -box.min.y, -center.z);
  const wrapper = new THREE.Group();
  wrapper.scale.setScalar(1 / height);
  wrapper.add(content);
  wrapper.traverse(node => {
    if (!node.isMesh) return;
    node.frustumCulled = true;
    node.castShadow = false;
    node.receiveShadow = false;
    if (node.material) {
      node.material = node.material.clone();
      node.material.transparent = false;
      node.material.depthWrite = true;
    }
  });
  return wrapper;
}

function chooseModel(resource, terrain, templates, id) {
  const biome = String(terrain?.biome || '').toLowerCase();
  const type = String(resource?.type || resource?.kind || '').toLowerCase();
  const arid = /desert|arid|dune|xeric|badland|cactus/.test(`${biome} ${type}`);
  const choices = arid
    ? ['cactus-tall', 'cactus-short']
    : /forest|wood|temperate|oak/.test(`${biome} ${type}`)
      ? ['tree-oak', 'tree-default']
      : ['tree-default', 'tree-oak'];
  const available = choices.filter(key => templates.has(key));
  if (!available.length) return templates.values().next().value || null;
  return templates.get(available[hashString(id) % available.length]);
}

async function waitForRuntime() {
  for (let attempt = 0; attempt < 300; attempt++) {
    const runtime = window.realitySandboxUnified;
    const planet = window.realitySandboxPlanet;
    const mode = window.realitySandboxSurfaceMode;
    const layer = document.getElementById('surfaceModeLayer');
    if (runtime?.getCamera && planet?.world?.ecs?.components?.resource && planet?.living?.sampleDynamicPlanet && mode?.isActive && layer) {
      return { runtime, planet, mode, layer };
    }
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  return null;
}

async function install({ runtime, planet, mode, layer }) {
  if (window.realitySandboxSurfacePlantModelsV74?.installed) return;
  const mobile = matchMedia('(max-width: 720px), (pointer: coarse)').matches;
  const limit = mobile ? MOBILE_LIMIT : DESKTOP_LIMIT;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: !mobile, powerPreference: 'high-performance', depth: true, stencil: false });
  renderer.setPixelRatio(Math.min(mobile ? 1 : 1.35, globalThis.devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.id = 'surfacePlantModelCanvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  Object.assign(renderer.domElement.style, {
    position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'none',
    zIndex: '0', pointerEvents: 'none', background: 'transparent',
  });
  layer.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const plants = new THREE.Group();
  scene.add(plants);
  scene.add(new THREE.HemisphereLight(0xdff3dc, 0x293629, 2.15));
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.6);
  sun.position.set(-3, 4, 5);
  scene.add(sun);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  const loader = new GLTFLoader();
  const templates = new Map();
  const records = [];
  let lastWidth = 0;
  let lastHeight = 0;
  let lastRebuild = -Infinity;
  let frames = 0;
  let activeFrames = 0;
  let rebuilds = 0;
  let visibleInstances = 0;
  let manifest = null;

  const assetBase = `${import.meta.env.BASE_URL}vendor/kenney-nature-kit/`;
  const response = await fetch(`${assetBase}manifest.json`, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`Plant model manifest failed: HTTP ${response.status}`);
  manifest = await response.json();

  await Promise.all(manifest.models.map(async model => {
    const gltf = await loader.loadAsync(`${assetBase}${model.file}`);
    templates.set(model.id, normalizeModel(gltf.scene));
  }));

  function clearPlants() {
    records.length = 0;
    plants.clear();
  }

  function rebuildPlantInstances() {
    clearPlants();
    const { world, living } = planet;
    const components = world.ecs.components;
    const rootCamera = runtime.getCamera();
    const frame = cameraFrame(rootCamera);
    const candidates = [];

    for (const [id, resource] of components.resource.entries()) {
      const amount = Number(resource?.amount) || 0;
      const position = components.position.get(id);
      if (!position || amount <= 0.015) continue;
      const nx = position.x / Math.max(1, world.width);
      const ny = position.y / Math.max(1, world.height);
      const normal = normalFor(nx, ny);
      const dot = normal.dot(frame.center);
      if (dot <= FRONT_DOT) continue;
      candidates.push({ id, resource, position, amount, nx, ny, normal, dot });
    }

    candidates.sort((a, b) => (b.dot + Math.min(0.25, b.amount * 0.05)) - (a.dot + Math.min(0.25, a.amount * 0.05)));
    for (const candidate of candidates.slice(0, limit)) {
      const terrain = living.sampleDynamicPlanet(candidate.position.x, candidate.position.y);
      if (!terrain?.land) continue;
      const template = chooseModel(candidate.resource, terrain, templates, candidate.id);
      if (!template) continue;
      const object = template.clone(true);
      const hash = hashString(candidate.id);
      const biomass = clamp(Math.log1p(candidate.amount) / 3.2, 0.18, 1);
      const tall = /tree|tall/.test(String(candidate.resource?.type || '')) || object === templates.get('cactus-tall');
      const scale = (tall ? 0.020 : 0.015) * (0.72 + biomass * 0.72) * (0.9 + (hash % 19) / 100);
      object.scale.multiplyScalar(scale);
      object.position.copy(candidate.normal).multiplyScalar(GLOBE_LIFT);
      object.quaternion.setFromUnitVectors(Y_AXIS, candidate.normal);
      object.rotateY(((hash % 360) / 180) * Math.PI);
      plants.add(object);
      records.push({ object, normal: candidate.normal });
    }
    rebuilds++;
    document.documentElement.dataset.surfacePlantInstances = String(records.length);
  }

  function resize(rootCamera) {
    const rect = layer.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (width !== lastWidth || height !== lastHeight) {
      renderer.setSize(width, height, false);
      lastWidth = width;
      lastHeight = height;
    }
    const radiusPx = Math.min(width, height) * (mobile ? 0.42 : 0.43) * rootCamera.zoom;
    const halfX = width / Math.max(1, radiusPx * 2);
    const halfY = height / Math.max(1, radiusPx * 2);
    camera.left = -halfX;
    camera.right = halfX;
    camera.top = halfY;
    camera.bottom = -halfY;
    camera.updateProjectionMatrix();
  }

  function syncCamera(rootCamera) {
    const frame = cameraFrame(rootCamera);
    camera.position.copy(frame.center).multiplyScalar(3);
    camera.up.copy(frame.north);
    camera.lookAt(0, 0, 0);
    visibleInstances = 0;
    for (const record of records) {
      const visible = record.normal.dot(frame.center) > FRONT_DOT;
      record.object.visible = visible;
      if (visible) visibleInstances++;
    }
  }

  function loop(now) {
    requestAnimationFrame(loop);
    frames++;
    const active = Boolean(mode.isActive?.() && document.documentElement.dataset.surfaceMode === 'active');
    if (!active) {
      renderer.domElement.style.display = 'none';
      return;
    }
    activeFrames++;
    renderer.domElement.style.display = 'block';
    const rootCamera = runtime.getCamera();
    resize(rootCamera);
    if (now - lastRebuild >= REBUILD_MS) {
      lastRebuild = now;
      rebuildPlantInstances();
    }
    syncCamera(rootCamera);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(loop);

  const api = {
    installed: true,
    build: BUILD,
    getStats: () => ({
      build: BUILD,
      source: manifest?.pack || 'Kenney Nature Kit 2.1',
      license: manifest?.license || 'CC0-1.0',
      entityDriven: true,
      globeAligned: true,
      canonicalPlanetRenderer: 'lofiLivingCanvas',
      modelOverlayRenderer: 'Three.js GLTFLoader',
      modelsLoaded: templates.size,
      instances: records.length,
      visibleInstances,
      maxInstances: limit,
      frames,
      activeFrames,
      rebuilds,
      rendererCalls: renderer.info.render.calls,
      rendererTriangles: renderer.info.render.triangles,
    }),
  };
  window.realitySandboxSurfacePlantModelsV74 = api;
  document.documentElement.dataset.surfacePlantModels = BUILD;
  document.documentElement.dataset.surfacePlantModelLicense = manifest?.license || 'CC0-1.0';

  const previousDiagnostics = window.realitySandboxPresentationDiagnostics;
  window.realitySandboxPresentationDiagnostics = () => ({
    ...(typeof previousDiagnostics === 'function' ? previousDiagnostics() : {}),
    surfacePlantModelsV74: api.getStats(),
  });
}

async function boot() {
  const state = await waitForRuntime();
  if (!state) {
    document.documentElement.dataset.surfacePlantModels = 'runtime-unavailable';
    return;
  }
  try {
    await install(state);
  } catch (error) {
    document.documentElement.dataset.surfacePlantModels = 'failed';
    document.documentElement.dataset.surfacePlantModelError = String(error?.message || error || 'unknown');
    console.warn('CC0 surface plant models unavailable:', error);
  }
}

boot();
