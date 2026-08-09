import * as THREE from 'three';

const UPDATE_MS = 1000 / 15;
const NEAR_FADE_START = 55;
const NEAR_FADE_END = 150;
const FAR_FADE_START = 2200;
const FAR_FADE_END = 5200;
const POINT_SIZE = 8.5;

function creatureType(mesh) {
  const name = String(mesh?.name || '');
  if (!name.startsWith('surfaceCreature-') || !name.includes('-body-')) return null;
  if (name.includes('-agent-')) return 'agent';
  if (name.includes('-predator-')) return 'predator';
  if (name.includes('-apex-')) return 'apex';
  return null;
}

async function waitForRuntime() {
  for (let i = 0; i < 420; i++) {
    const creatures = window.realitySandboxSurfaceCreaturesV44;
    const visibility = window.realitySandboxSurfaceCreatureVisibilityV44b;
    const objects = window.realitySandboxSurfaceLightHookV36?.getObjects?.();
    if (creatures?.installed && visibility?.installed && objects?.scene && objects?.camera) {
      return { creatures, visibility, scene: objects.scene, camera: objects.camera };
    }
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  return null;
}

function install({ creatures, scene, camera }) {
  if (window.realitySandboxSurfaceCreatureReadabilityV44c?.installed) return;

  const geometry = new THREE.BufferGeometry();
  let capacity = 32;
  let positions = new Float32Array(capacity * 3);
  let colors = new Float32Array(capacity * 3);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setDrawRange(0, 0);

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: true,
    depthWrite: false,
    vertexColors: true,
    blending: THREE.NormalBlending,
    uniforms: {
      pointSize: { value: POINT_SIZE },
      nearStart: { value: NEAR_FADE_START },
      nearEnd: { value: NEAR_FADE_END },
      farStart: { value: FAR_FADE_START },
      farEnd: { value: FAR_FADE_END },
    },
    vertexShader: `
      uniform float pointSize;
      uniform float nearStart;
      uniform float nearEnd;
      uniform float farStart;
      uniform float farEnd;
      attribute vec3 color;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float dist = max(0.0, -mv.z);
        float nearFade = smoothstep(nearStart, nearEnd, dist);
        float farFade = 1.0 - smoothstep(farStart, farEnd, dist);
        vAlpha = nearFade * farFade;
        vColor = color;
        gl_PointSize = max(1.0, pointSize * (0.72 + 0.28 * nearFade));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot(p, p);
        if (r2 > 1.0 || vAlpha < 0.01) discard;
        float core = 1.0 - smoothstep(0.18, 1.0, r2);
        float alpha = vAlpha * (0.34 + core * 0.66);
        vec3 bright = mix(vColor, vec3(1.0), 0.28 + core * 0.18);
        gl_FragColor = vec4(bright, alpha);
      }
    `,
  });

  const points = new THREE.Points(geometry, material);
  points.name = 'surfaceCreatureFarFaunaGlintsV44c';
  points.frustumCulled = false;
  points.renderOrder = 6;
  scene.add(points);

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const instanceColor = new THREE.Color();
  const fallbackColors = {
    agent: new THREE.Color().setHSL(0.34, 0.80, 0.58),
    predator: new THREE.Color().setHSL(0.04, 0.90, 0.58),
    apex: new THREE.Color().setHSL(0.56, 0.76, 0.66),
  };

  let lastUpdate = -Infinity;
  let updates = 0;
  let glintPoints = 0;
  let nearestDistance = Infinity;
  let nearestType = '';
  let meshesObserved = 0;
  let capacityGrowths = 0;

  function ensureCapacity(required) {
    if (required <= capacity) return;
    while (capacity < required) capacity *= 2;
    positions = new Float32Array(capacity * 3);
    colors = new Float32Array(capacity * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    capacityGrowths++;
  }

  function creatureBodies() {
    const found = [];
    scene.traverse(object => {
      if (object?.isInstancedMesh && creatureType(object)) found.push(object);
    });
    return found;
  }

  function update(now) {
    requestAnimationFrame(update);
    const active = document.documentElement.dataset.surfaceMode === 'active';
    points.visible = active;
    if (!active || now - lastUpdate < UPDATE_MS) return;
    lastUpdate = now;

    const bodies = creatureBodies();
    meshesObserved = bodies.length;
    let total = 0;
    for (const mesh of bodies) total += Math.max(0, Number(mesh.count) || 0);
    ensureCapacity(total);

    let out = 0;
    nearestDistance = Infinity;
    nearestType = '';
    for (const mesh of bodies) {
      const type = creatureType(mesh);
      const count = Math.max(0, Number(mesh.count) || 0);
      for (let i = 0; i < count; i++) {
        mesh.getMatrixAt(i, matrix);
        position.setFromMatrixPosition(matrix);
        positions[out * 3] = position.x;
        positions[out * 3 + 1] = position.y + (type === 'apex' ? 4.4 : type === 'predator' ? 3.4 : 2.8);
        positions[out * 3 + 2] = position.z;

        let c = fallbackColors[type];
        if (mesh.instanceColor && typeof mesh.getColorAt === 'function') {
          mesh.getColorAt(i, instanceColor);
          c = instanceColor;
        }
        colors[out * 3] = c.r;
        colors[out * 3 + 1] = c.g;
        colors[out * 3 + 2] = c.b;

        const d = camera.position.distanceTo(position);
        if (d < nearestDistance) {
          nearestDistance = d;
          nearestType = type;
        }
        out++;
      }
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.setDrawRange(0, out);
    glintPoints = out;
    updates++;
    document.documentElement.dataset.surfaceCreatureGlintsV44c = String(out);
  }
  requestAnimationFrame(update);

  const api = {
    installed: true,
    getStats: () => ({
      installed: true,
      presentationOnly: true,
      ecologyUnchanged: true,
      actualCreaturePositions: true,
      oneGlintPerRenderedCreature: true,
      glintPoints,
      population: creatures.getStats?.().population ?? null,
      meshesObserved,
      updates,
      nearestCreatureDistance: Number.isFinite(nearestDistance) ? nearestDistance : null,
      nearestCreatureType: nearestType || null,
      nearFadeStart: NEAR_FADE_START,
      nearFadeEnd: NEAR_FADE_END,
      pointSizePixels: POINT_SIZE,
      depthTested: true,
      singleAdditionalDrawCall: true,
      additionalDrawCalls: 1,
      globalDisplayCap: false,
      capacity,
      capacityGrowths,
      renderLoopProceduralSamples: 0,
    }),
  };

  window.realitySandboxSurfaceCreatureReadabilityV44c = api;
  document.documentElement.dataset.surfaceCreatureReadabilityV44c = 'depth-tested-far-fauna-glints';
  const prev = window.realitySandboxPresentationDiagnostics;
  window.realitySandboxPresentationDiagnostics = () => ({
    ...(typeof prev === 'function' ? prev() : {}),
    surfaceCreatureReadabilityV44c: api.getStats(),
  });
}

waitForRuntime().then(state => {
  if (!state) {
    document.documentElement.dataset.surfaceCreatureReadabilityV44c = 'unavailable';
    return;
  }
  install(state);
});
