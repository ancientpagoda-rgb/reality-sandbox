import * as THREE from 'three';

const SEA_LEVEL = 0.53;
const Z_SCALE = 62;
const FOV_DEGREES = 100;
const MAX_DRAW_DISTANCE = 460;
const WORKER_DRAW_DISTANCE = 220;
const EPSILON = 1e-6;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number(v) || 0));
const wrap = (value, max) => ((value % max) + max) % max;

async function waitForRuntime() {
  for (let attempt = 0; attempt < 400; attempt++) {
    const settlement = window.realitySandboxRunevaleSettlementV68;
    const sphere = window.realitySandboxSurfaceSphereV37;
    const surface = window.realitySandboxSurfaceMode;
    const planet = window.realitySandboxPlanet;
    const layer = document.getElementById('surfaceModeLayer');
    const gpuCanvas = document.getElementById('surfaceGpuCanvas');
    if (
      settlement?.installed && sphere?.installed && surface?.getPlayer && surface?.isActive &&
      planet?.living?.sampleDynamicPlanet && planet?.waterCycle?.sample && layer && gpuCanvas
    ) return { settlement, sphere, surface, planet, layer, gpuCanvas };
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return null;
}

function install({ settlement, sphere, surface, planet, layer, gpuCanvas }) {
  if (window.realitySandboxRunevaleSettlementSphereGpuV68a?.installed) return;

  const { world, living, waterCycle } = planet;
  const originalTerrainSample = living.sampleDynamicPlanet.bind(living);
  const originalWaterSample = waterCycle.sample.bind(waterCycle);
  let exactActionDepth = 0;
  let exactActionTerrainReads = 0;
  let exactActionWaterReads = 0;

  // Sphere v37 deliberately returns a cached HUD sample for ordinary 2-argument
  // reads while surface mode is active. A third inert argument bypasses that
  // presentation cache and reaches the real deterministic simulation sampler.
  living.sampleDynamicPlanet = function v68PhysicalActionAwareTerrain(x, y, ...rest) {
    if (exactActionDepth > 0 && rest.length === 0) {
      exactActionTerrainReads++;
      return originalTerrainSample(x, y, 'v68-exact-physical-action');
    }
    return originalTerrainSample(x, y, ...rest);
  };
  waterCycle.sample = function v68PhysicalActionAwareWater(x, y, ...rest) {
    if (exactActionDepth > 0 && rest.length === 0) {
      exactActionWaterReads++;
      return originalWaterSample(x, y, 'v68-exact-physical-action');
    }
    return originalWaterSample(x, y, ...rest);
  };

  function withExactActionSamples(fn) {
    exactActionDepth++;
    try { return fn(); }
    finally { exactActionDepth = Math.max(0, exactActionDepth - 1); }
  }

  for (const name of ['gatherWood','gatherStone','foundSettlement','placeBlueprint']) {
    const original = settlement[name]?.bind(settlement);
    if (!original || original.__v68ExactSamplingWrapped) continue;
    const wrapped = (...args) => withExactActionSamples(() => original(...args));
    wrapped.__v68ExactSamplingWrapped = true;
    settlement[name] = wrapped;
  }

  const actionKeyCodes = new Set(['KeyG','KeyV','KeyP']);
  window.addEventListener('keydown', event => {
    if (!surface.isActive?.() || !actionKeyCodes.has(event.code)) return;
    exactActionDepth++;
    queueMicrotask(() => { exactActionDepth = Math.max(0, exactActionDepth - 1); });
  }, { capture:true });
  document.addEventListener('click', event => {
    if (!surface.isActive?.() || !event.target?.closest?.('#runevaleSettlementHudV68')) return;
    exactActionDepth++;
    queueMicrotask(() => { exactActionDepth = Math.max(0, exactActionDepth - 1); });
  }, { capture:true });

  const legacyOverlay = document.getElementById('runevaleSettlementCanvasV68');
  if (legacyOverlay) {
    legacyOverlay.style.display = 'none';
    legacyOverlay.dataset.supersededBy = 'runevaleSettlementSphereGpuV68a';
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      alpha:true,
      antialias:!matchMedia('(max-width: 720px), (pointer: coarse)').matches,
      powerPreference:'high-performance',
      depth:true,
      stencil:false,
      premultipliedAlpha:true,
    });
  } catch {
    document.documentElement.dataset.runevaleSettlementSphereGpuV68a = 'webgl-unavailable';
    return;
  }

  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.35));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.id = 'runevaleSettlementSphereGpuCanvasV68a';
  renderer.domElement.setAttribute('aria-label', 'GPU-rendered Runevale settlement structures and workers on Nysa');
  Object.assign(renderer.domElement.style, {
    position:'absolute',
    inset:'0',
    width:'100%',
    height:'100%',
    display:'none',
    zIndex:'1',
    pointerEvents:'none',
    background:'transparent',
  });
  layer.appendChild(renderer.domElement);

  // The sphere terrain renderer is z=0; the transparent castle renderer is z=1;
  // the existing Nysa HUD remains z=2 and the v68 build controls remain z=4.
  gpuCanvas.style.zIndex = '0';
  const surfaceHud = document.getElementById('surfaceModeHud');
  if (surfaceHud) surfaceHud.style.zIndex = '2';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV_DEGREES, 1, 0.1, 1700);
  scene.add(new THREE.HemisphereLight(0xe5f0ff, 0x392f26, 1.8));
  const sun = new THREE.DirectionalLight(0xffe5bd, 2.1);
  sun.position.set(95, 155, 80);
  scene.add(sun);

  const structureRoot = new THREE.Group();
  const workerRoot = new THREE.Group();
  scene.add(structureRoot, workerRoot);

  const materials = {
    wood:new THREE.MeshStandardMaterial({ color:0x73523b, roughness:0.96, metalness:0 }),
    woodLight:new THREE.MeshStandardMaterial({ color:0x9b7048, roughness:0.96, metalness:0 }),
    stone:new THREE.MeshStandardMaterial({ color:0x88877f, roughness:0.98, metalness:0 }),
    roof:new THREE.MeshStandardMaterial({ color:0x5f4030, roughness:0.98, metalness:0 }),
    farm:new THREE.MeshStandardMaterial({ color:0x887a3d, roughness:1, metalness:0 }),
    worker:new THREE.MeshStandardMaterial({ color:0xd8c6a4, roughness:0.92, metalness:0 }),
    cargo:new THREE.MeshStandardMaterial({ color:0xc79a55, roughness:0.95, metalness:0 }),
    blueprint:new THREE.MeshStandardMaterial({
      color:0x8fd5de, roughness:0.7, metalness:0, transparent:true, opacity:0.42,
      wireframe:true, depthWrite:false,
    }),
    construction:new THREE.MeshStandardMaterial({ color:0xb99a68, roughness:0.98, metalness:0 }),
  };

  const geometries = {
    unitBox:new THREE.BoxGeometry(1,1,1),
    unitCylinder:new THREE.CylinderGeometry(0.5,0.5,1,10),
    roof:new THREE.ConeGeometry(0.78,0.7,4),
    workerBody:new THREE.CapsuleGeometry(0.22,0.62,4,8),
    workerHead:new THREE.SphereGeometry(0.18,8,6),
  };

  const structureObjects = new Map();
  const workerObjects = new Map();
  let lastStateSignature = '';
  let lastWidth = 0;
  let lastHeight = 0;
  let frames = 0;
  let activeFrames = 0;
  let visibleStructures = 0;
  let visibleWorkers = 0;
  let centrallyVisibleStructures = 0;
  let structureTriangles = 0;
  let workerTriangles = 0;
  let lastActiveChunkKey = '';
  let lastAnchorX = NaN;
  let lastAnchorY = NaN;
  let lastCurvatureRadius = NaN;
  let exactRenderTerrainReads = 0;

  function shortestWrappedDelta(value, origin, size) {
    let delta = value - origin;
    if (delta > size * 0.5) delta -= size;
    else if (delta < -size * 0.5) delta += size;
    return delta;
  }

  function sphereSag(x, z, radius) {
    const d2 = x * x + z * z;
    const r2 = radius * radius;
    return radius - Math.sqrt(Math.max(1, r2 - Math.min(d2, r2 - 1)));
  }

  function parseAnchor(stats, player) {
    const stride = Math.max(1, Number(stats.chunkStride) || 72);
    const key = String(stats.activeChunkKey || '');
    const parts = key.split(':').map(Number);
    if (parts.length === 2 && parts.every(Number.isFinite)) {
      return {
        key,
        x:wrap((parts[0] + 0.5) * stride, world.width),
        y:clamp((parts[1] + 0.5) * stride, 0, world.height),
        stride,
      };
    }
    const chunkX = Math.floor(player.x / stride);
    const chunkY = Math.floor(player.y / stride);
    return {
      key:`${chunkX}:${chunkY}`,
      x:wrap((chunkX + 0.5) * stride, world.width),
      y:clamp((chunkY + 0.5) * stride, 0, world.height),
      stride,
    };
  }

  function exactTerrain(x, y) {
    exactRenderTerrainReads++;
    return living.sampleDynamicPlanet(wrap(x, world.width), clamp(y, 0, world.height), 'v68-sphere-gpu-exact');
  }

  function stateSignature(state) {
    const structures = (state.structures || []).map(item => `${item.id}:${item.type}:${item.status}:${Number(item.progress || 0).toFixed(3)}`).join('|');
    return `${state.settlement?.id || 'none'};${structures}`;
  }

  function addBox(parent, sx, sy, sz, x, y, z, material) {
    const mesh = new THREE.Mesh(geometries.unitBox, material);
    mesh.scale.set(Math.max(EPSILON,sx), Math.max(EPSILON,sy), Math.max(EPSILON,sz));
    mesh.position.set(x,y,z);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    parent.add(mesh);
    return mesh;
  }

  function makePalisade(spec, material) {
    const group = new THREE.Group();
    const posts = Math.max(5, Math.ceil(spec.width / 0.85));
    for (let i = 0; i < posts; i++) {
      const x = -spec.width * 0.5 + (i + 0.5) * spec.width / posts;
      addBox(group, spec.width / posts * 0.78, spec.height, 0.34, x, spec.height * 0.5, 0, material);
    }
    return group;
  }

  function makeTower(spec, material) {
    const group = new THREE.Group();
    addBox(group, spec.width, spec.height, spec.width, 0, spec.height * 0.5, 0, material);
    const crenels = 5;
    for (let side = 0; side < 4; side++) {
      for (let i = 0; i < crenels; i++) {
        const p = -spec.width * 0.5 + (i + 0.5) * spec.width / crenels;
        const x = side < 2 ? p : (side === 2 ? -spec.width * 0.48 : spec.width * 0.48);
        const z = side >= 2 ? p : (side === 0 ? -spec.width * 0.48 : spec.width * 0.48);
        addBox(group, side < 2 ? spec.width / crenels * 0.55 : 0.35, 0.55, side >= 2 ? spec.width / crenels * 0.55 : 0.35, x, spec.height + 0.28, z, material);
      }
    }
    return group;
  }

  function makeGatehouse(spec, material) {
    const group = new THREE.Group();
    const towerWidth = spec.width * 0.26;
    addBox(group, towerWidth, spec.height, spec.width * 0.48, -spec.width * 0.34, spec.height * 0.5, 0, material);
    addBox(group, towerWidth, spec.height, spec.width * 0.48, spec.width * 0.34, spec.height * 0.5, 0, material);
    addBox(group, spec.width * 0.48, spec.height * 0.27, spec.width * 0.44, 0, spec.height * 0.82, 0, material);
    return group;
  }

  function makeHouse(spec, wallMaterial) {
    const group = new THREE.Group();
    addBox(group, spec.width, spec.height * 0.68, spec.width * 0.72, 0, spec.height * 0.34, 0, wallMaterial);
    const roof = new THREE.Mesh(geometries.roof, materials.roof);
    roof.scale.set(spec.width * 0.78, spec.height * 0.55, spec.width * 0.64);
    roof.position.y = spec.height * 0.82;
    roof.rotation.y = Math.PI * 0.25;
    group.add(roof);
    return group;
  }

  function makeWell(spec, material) {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(spec.width * 0.38, 0.22, 7, 16), material);
    ring.rotation.x = Math.PI * 0.5;
    ring.position.y = 0.55;
    group.add(ring);
    addBox(group, 0.18, spec.height, 0.18, -spec.width * 0.4, spec.height * 0.5, 0, materials.wood);
    addBox(group, 0.18, spec.height, 0.18, spec.width * 0.4, spec.height * 0.5, 0, materials.wood);
    return group;
  }

  function makeFarm(spec, material) {
    const group = new THREE.Group();
    addBox(group, spec.width, 0.18, spec.width * 0.72, 0, 0.09, 0, material);
    for (let i = -4; i <= 4; i++) addBox(group, 0.10, 0.55, spec.width * 0.65, i * spec.width / 10, 0.34, 0, materials.woodLight);
    return group;
  }

  function structureMaterial(item) {
    if (item.status === 'blueprint') return materials.blueprint;
    if (item.status === 'construction') return materials.construction;
    if (['tower','gatehouse','keep','well'].includes(item.type)) return materials.stone;
    if (item.type === 'farm') return materials.farm;
    return materials.wood;
  }

  function makeStructureObject(item) {
    const spec = settlement.catalog[item.type];
    const material = structureMaterial(item);
    let object;
    if (item.type === 'palisade') object = makePalisade(spec, material);
    else if (item.type === 'tower' || item.type === 'keep') object = makeTower(spec, material);
    else if (item.type === 'gatehouse') object = makeGatehouse(spec, material);
    else if (item.type === 'well') object = makeWell(spec, material);
    else if (item.type === 'farm') object = makeFarm(spec, material);
    else object = makeHouse(spec, material);
    object.userData = { structureId:item.id, worldX:item.x, worldY:item.y, rotation:Number(item.rotation) || 0, type:item.type };
    const progressScale = item.status === 'complete' ? 1 : item.status === 'construction' ? Math.max(0.18, clamp(item.progress)) : 0.16;
    object.scale.y = progressScale;
    object.traverse(child => {
      if (child.isMesh && item.status === 'blueprint') child.renderOrder = 4;
    });
    return object;
  }

  function rebuildStructures(state) {
    for (const object of structureObjects.values()) {
      structureRoot.remove(object);
      object.traverse(child => {
        if (child.geometry && child.geometry !== geometries.unitBox && child.geometry !== geometries.roof) child.geometry.dispose?.();
      });
    }
    structureObjects.clear();
    for (const item of state.structures || []) {
      const object = makeStructureObject(item);
      structureObjects.set(item.id, object);
      structureRoot.add(object);
    }
  }

  function ensureWorkerObject(worker) {
    let group = workerObjects.get(worker.id);
    if (group) return group;
    group = new THREE.Group();
    const body = new THREE.Mesh(geometries.workerBody, materials.worker);
    body.position.y = 0.62;
    group.add(body);
    const head = new THREE.Mesh(geometries.workerHead, materials.worker);
    head.position.y = 1.43;
    group.add(head);
    const cargo = addBox(group, 0.46, 0.36, 0.36, 0, 0.78, -0.34, materials.cargo);
    cargo.name = 'cargo';
    group.userData = { workerId:worker.id };
    workerObjects.set(worker.id, group);
    workerRoot.add(group);
    return group;
  }

  function pruneWorkers(state) {
    const live = new Set((state.workers || []).map(item => item.id));
    for (const [id, object] of workerObjects.entries()) {
      if (live.has(id)) continue;
      workerRoot.remove(object);
      workerObjects.delete(id);
    }
  }

  function worldFrame(player) {
    const sphereStats = sphere.getStats?.() || {};
    const anchor = parseAnchor(sphereStats, player);
    return {
      anchor,
      curvatureRadius:Number(sphereStats.curvatureRadius) || Math.max(world.width, world.height) * 22,
      activeChunkKey:String(sphereStats.activeChunkKey || anchor.key),
    };
  }

  const yAxis = new THREE.Vector3(0,1,0);
  const up = new THREE.Vector3();
  const east = new THREE.Vector3();
  const south = new THREE.Vector3();
  const horizontal = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const cameraPosition = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const align = new THREE.Quaternion();
  const yawQuat = new THREE.Quaternion();
  const projected = new THREE.Vector3();

  function groundAndUp(worldX, worldY, frame) {
    const localX = shortestWrappedDelta(worldX, frame.anchor.x, world.width);
    const localZ = worldY - frame.anchor.y;
    const sag = sphereSag(localX, localZ, frame.curvatureRadius);
    const terrain = exactTerrain(worldX, worldY);
    const elevation = terrain?.land ? clamp(terrain.elevation ?? SEA_LEVEL, 0, 1) : SEA_LEVEL - 0.005;
    const groundY = elevation * Z_SCALE - sag;
    up.set(localX, frame.curvatureRadius - sag, localZ).normalize();
    return { localX, localZ, groundY, up:up.clone() };
  }

  function updateCamera(player, frame) {
    const localX = shortestWrappedDelta(player.x, frame.anchor.x, world.width);
    const localZ = player.y - frame.anchor.y;
    const playerGround = groundAndUp(player.x, player.y, frame);
    const localUp = playerGround.up;
    east.set(localUp.y, -localUp.x, 0).normalize();
    south.crossVectors(east, localUp).normalize();
    const altitude = Math.max(3.6, Number(player.altitude) || 3.6);
    cameraPosition.set(localX, playerGround.groundY, localZ).addScaledVector(localUp, altitude);
    horizontal.copy(east).multiplyScalar(Math.cos(player.yaw || 0)).addScaledVector(south, Math.sin(player.yaw || 0)).normalize();
    forward.copy(horizontal).multiplyScalar(Math.cos(player.pitch || 0)).addScaledVector(localUp, Math.sin(player.pitch || 0)).normalize();
    camera.position.copy(cameraPosition);
    camera.up.copy(localUp);
    lookTarget.copy(cameraPosition).addScaledVector(forward, 30);
    camera.lookAt(lookTarget);
  }

  function updateWorldObjects(state, player, frame) {
    visibleStructures = 0;
    visibleWorkers = 0;
    centrallyVisibleStructures = 0;

    const signature = stateSignature(state);
    if (signature !== lastStateSignature) {
      lastStateSignature = signature;
      rebuildStructures(state);
    }
    pruneWorkers(state);

    for (const item of state.structures || []) {
      const object = structureObjects.get(item.id);
      if (!object) continue;
      const dxPlayer = shortestWrappedDelta(item.x, player.x, world.width);
      const dyPlayer = item.y - player.y;
      const d = Math.hypot(dxPlayer, dyPlayer);
      object.visible = d <= MAX_DRAW_DISTANCE;
      if (!object.visible) continue;
      const framePoint = groundAndUp(item.x, item.y, frame);
      object.position.set(framePoint.localX, framePoint.groundY + 0.04, framePoint.localZ);
      align.setFromUnitVectors(yAxis, framePoint.up);
      yawQuat.setFromAxisAngle(framePoint.up, -(Number(item.rotation) || 0));
      object.quaternion.copy(yawQuat).multiply(align);
      visibleStructures++;
      projected.copy(object.position).project(camera);
      if (projected.z >= -1 && projected.z <= 1 && Math.abs(projected.x) <= 0.94 && Math.abs(projected.y) <= 0.94) centrallyVisibleStructures++;
    }

    for (const worker of state.workers || []) {
      const object = ensureWorkerObject(worker);
      const dxPlayer = shortestWrappedDelta(worker.x, player.x, world.width);
      const dyPlayer = worker.y - player.y;
      const d = Math.hypot(dxPlayer, dyPlayer);
      object.visible = d <= WORKER_DRAW_DISTANCE;
      if (!object.visible) continue;
      const framePoint = groundAndUp(worker.x, worker.y, frame);
      object.position.set(framePoint.localX, framePoint.groundY + 0.04, framePoint.localZ);
      align.setFromUnitVectors(yAxis, framePoint.up);
      object.quaternion.copy(align);
      const cargo = object.getObjectByName('cargo');
      if (cargo) cargo.visible = Number(worker.cargo?.wood || 0) > 0 || Number(worker.cargo?.stone || 0) > 0;
      visibleWorkers++;
    }
  }

  function resize() {
    const rect = layer.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || innerWidth || 1));
    const height = Math.max(1, Math.round(rect.height || innerHeight || 1));
    if (width === lastWidth && height === lastHeight) return;
    lastWidth = width;
    lastHeight = height;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function loop() {
    requestAnimationFrame(loop);
    frames++;
    const active = Boolean(surface.isActive?.() && document.documentElement.dataset.surfaceMode === 'active');
    renderer.domElement.style.display = active ? 'block' : 'none';
    if (!active) return;
    activeFrames++;
    resize();
    const player = surface.getPlayer();
    if (!player) return;
    const frame = worldFrame(player);
    if (!frame.activeChunkKey) return;
    lastActiveChunkKey = frame.activeChunkKey;
    lastAnchorX = frame.anchor.x;
    lastAnchorY = frame.anchor.y;
    lastCurvatureRadius = frame.curvatureRadius;
    updateCamera(player, frame);
    const state = settlement.getState();
    updateWorldObjects(state, player, frame);
    renderer.render(scene, camera);
    structureTriangles = renderer.info.render.triangles;
    workerTriangles = visibleWorkers > 0 ? renderer.info.render.triangles : 0;
    document.documentElement.dataset.runevaleSettlementVisibleStructures = String(visibleStructures);
    document.documentElement.dataset.runevaleSettlementCentralStructures = String(centrallyVisibleStructures);
  }
  requestAnimationFrame(loop);

  const previousGetStats = settlement.getStats.bind(settlement);
  settlement.getStats = () => ({
    ...previousGetStats(),
    sphereGpuStructureRenderer:true,
    physicalActionsBypassSphereHudCache:true,
    visibleGpuStructures:visibleStructures,
    centrallyVisibleGpuStructures:centrallyVisibleStructures,
    visibleGpuWorkers:visibleWorkers,
  });

  const api = {
    installed:true,
    getStats:() => ({
      installed:true,
      strategy:'transparent-threejs-spherical-settlement-layer',
      matchesSurfaceSphereFovDegrees:FOV_DEGREES,
      sharesSurfacePlayerCameraState:true,
      sharesSurfaceChunkAnchor:true,
      sharesSurfaceCurvatureRadius:true,
      usesExactTerrainForPhysicalPlacement:true,
      physicalActionsBypassSphereHudCache:true,
      legacy2dOverlayHidden:Boolean(legacyOverlay && legacyOverlay.style.display === 'none'),
      canvasAboveTerrainBelowHud:true,
      noHardStructureDrawCap:true,
      maxDrawDistance:MAX_DRAW_DISTANCE,
      workerDrawDistance:WORKER_DRAW_DISTANCE,
      frames,
      activeFrames,
      visibleStructures,
      centrallyVisibleStructures,
      visibleWorkers,
      structureTriangles,
      workerTriangles,
      exactActionTerrainReads,
      exactActionWaterReads,
      exactRenderTerrainReads,
      activeChunkKey:lastActiveChunkKey,
      anchorX:lastAnchorX,
      anchorY:lastAnchorY,
      curvatureRadius:lastCurvatureRadius,
      resolution:`${renderer.domElement.width}x${renderer.domElement.height}`,
      rendererCalls:renderer.info.render.calls,
      rendererTriangles:renderer.info.render.triangles,
    }),
  };

  window.realitySandboxRunevaleSettlementSphereGpuV68a = api;
  document.documentElement.dataset.runevaleSettlementSphereGpuV68a = 'ready-spherical-threejs';

  const previousDiagnostics = window.realitySandboxPresentationDiagnostics;
  window.realitySandboxPresentationDiagnostics = () => ({
    ...(typeof previousDiagnostics === 'function' ? previousDiagnostics() : {}),
    runevaleSettlementV68:previousGetStats(),
    runevaleSettlementSphereGpuV68a:api.getStats(),
  });
}

waitForRuntime().then(state => {
  if (!state) {
    document.documentElement.dataset.runevaleSettlementSphereGpuV68a = 'unavailable';
    return;
  }
  install(state);
});
