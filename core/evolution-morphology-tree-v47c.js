const UPDATE_MS = 700;

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number(v) || 0));
const pct = v => `${Math.round(clamp(v) * 100)}%`;

async function waitForInspector() {
  while (true) {
    const inspector = window.realitySandboxEvolutionInspectorV47b;
    const origin = window.realitySandboxOriginMotileLifeV47;
    const host = document.getElementById('evolutionInspectorV47bHost');
    if (inspector?.installed && origin?.installed && host?.shadowRoot) return { inspector, origin, root: host.shadowRoot };
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function meanGenome(members, fallback = {}) {
  if (!members.length) return { ...fallback };
  const keys = [
    'photosynthesis', 'heterotrophy', 'motility', 'sense', 'brainSpeed', 'sociality',
    'dormancy', 'toxin', 'neurotoxin', 'scavenging', 'aggression', 'armor',
    'seedInvestment', 'metabolism', 'bodySize',
  ];
  const out = {};
  for (const key of keys) out[key] = members.reduce((sum, item) => sum + (Number(item.genome?.[key]) || 0), 0) / members.length;
  return out;
}

function lineagePath(lineage, byId) {
  const path = [];
  const seen = new Set();
  let current = lineage;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : null;
  }
  return path;
}

function morphologySvg(lineage, genome) {
  const g = genome || {};
  const motility = clamp(g.motility);
  const photo = clamp(g.photosynthesis);
  const hetero = clamp(g.heterotrophy);
  const sense = clamp(g.sense);
  const brain = clamp(g.brainSpeed);
  const armor = clamp(g.armor);
  const toxin = clamp(g.toxin);
  const neuro = clamp(g.neurotoxin);
  const aggression = clamp(g.aggression);
  const bodySize = clamp(g.bodySize);
  const social = clamp(g.sociality);

  const bodyW = 58 + bodySize * 78;
  const bodyH = 32 + bodySize * 42;
  const cx = 150;
  const cy = 78;
  const left = cx - bodyW / 2;
  const right = cx + bodyW / 2;
  const top = cy - bodyH / 2;
  const bottom = cy + bodyH / 2;

  const appendages = Math.max(0, Math.min(8, Math.round(motility * 6 + hetero * 2)));
  const sensors = Math.max(0, Math.min(4, Math.round(sense * 3 + brain)));
  const fronds = Math.max(0, Math.min(7, Math.round(photo * 6 - motility * 2)));
  const plates = Math.max(0, Math.min(8, Math.round(armor * 8)));
  const toxinDots = Math.max(0, Math.min(9, Math.round((toxin + neuro) * 5)));
  const mouth = hetero > 0.16;
  const teeth = aggression > 0.36;

  let limbs = '';
  for (let i = 0; i < appendages; i++) {
    const side = i % 2 ? 1 : -1;
    const row = Math.floor(i / 2);
    const y = top + bodyH * ((row + 1) / (Math.ceil(appendages / 2) + 1));
    const x1 = side < 0 ? left + 4 : right - 4;
    const x2 = x1 + side * (18 + motility * 20);
    const y2 = y + ((row % 2) ? 9 : -9);
    limbs += `<path d="M ${x1.toFixed(1)} ${y.toFixed(1)} Q ${(x1 + x2) / 2} ${(y + y2) / 2 + 8} ${x2.toFixed(1)} ${y2.toFixed(1)}" class="limb"/>`;
  }

  let eyes = '';
  for (let i = 0; i < sensors; i++) {
    const yy = cy - (sensors - 1) * 6 + i * 12;
    const xx = right - 7;
    eyes += `<circle cx="${xx.toFixed(1)}" cy="${yy.toFixed(1)}" r="${(2.2 + sense * 2.3).toFixed(1)}" class="eye"/><circle cx="${(xx + 1).toFixed(1)}" cy="${yy.toFixed(1)}" r="1.1" class="pupil"/>`;
  }

  let frondSvg = '';
  for (let i = 0; i < fronds; i++) {
    const spread = (i - (fronds - 1) / 2) * 11;
    const baseX = cx + spread * 0.7;
    const baseY = top + 3;
    const tipX = cx + spread * 1.7;
    const tipY = top - 18 - photo * 22 - Math.abs(spread) * 0.15;
    frondSvg += `<path d="M ${baseX.toFixed(1)} ${baseY.toFixed(1)} Q ${(baseX + tipX) / 2} ${(baseY + tipY) / 2 - 6} ${tipX.toFixed(1)} ${tipY.toFixed(1)}" class="frond"/><ellipse cx="${tipX.toFixed(1)}" cy="${tipY.toFixed(1)}" rx="5" ry="2.8" class="leaf"/>`;
  }

  let plateSvg = '';
  for (let i = 0; i < plates; i++) {
    const x = left + 12 + (i + 0.5) * Math.max(7, (bodyW - 24) / Math.max(plates, 1));
    plateSvg += `<path d="M ${x.toFixed(1)} ${(top + 6).toFixed(1)} l 6 8 l -12 0 z" class="plate"/>`;
  }

  let dots = '';
  for (let i = 0; i < toxinDots; i++) {
    const angle = (i / Math.max(1, toxinDots)) * Math.PI * 2;
    const x = cx + Math.cos(angle) * bodyW * 0.28;
    const y = cy + Math.sin(angle) * bodyH * 0.26;
    dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(1.7 + neuro * 1.3).toFixed(1)}" class="toxin"/>`;
  }

  const mouthSvg = mouth
    ? `<path d="M ${(right - 12).toFixed(1)} ${(cy + 10).toFixed(1)} q 10 ${teeth ? 7 : 3} 20 0" class="mouth"/>${teeth ? `<path d="M ${(right - 6).toFixed(1)} ${(cy + 11).toFixed(1)} l 4 6 l 4 -6 l 4 6" class="teeth"/>` : ''}`
    : '';

  const socialRings = social > 0.55
    ? `<circle cx="${cx}" cy="${cy}" r="${(bodyW * 0.72).toFixed(1)}" class="social-ring"/><circle cx="${cx}" cy="${cy}" r="${(bodyW * 0.90).toFixed(1)}" class="social-ring faint"/>`
    : '';

  const formLabel = lineage?.form || (lineage?.type === 'photosynthetic' ? 'plant' : 'motile life');
  return `<svg class="morph-svg" viewBox="0 0 300 165" role="img" aria-label="Genome-derived organism schematic for ${lineage?.name || 'lineage'}">
    ${socialRings}
    ${frondSvg}
    ${limbs}
    <ellipse cx="${cx}" cy="${cy}" rx="${(bodyW / 2).toFixed(1)}" ry="${(bodyH / 2).toFixed(1)}" class="body"/>
    ${plateSvg}
    ${dots}
    ${eyes}
    ${mouthSvg}
    <text x="12" y="151" class="caption">${formLabel} · morphology inferred from genome</text>
  </svg>`;
}

function treeSvg(path) {
  if (!path.length) return '<div class="tree-empty">No ancestry recorded yet.</div>';
  const width = Math.max(330, path.length * 128 + 28);
  const height = 112;
  let connectors = '';
  let nodes = '';
  path.forEach((lineage, index) => {
    const x = 64 + index * 128;
    const y = 48;
    if (index > 0) connectors += `<path d="M ${x - 78} ${y} C ${x - 52} ${y}, ${x - 40} ${y}, ${x - 28} ${y}" class="tree-link"/>`;
    const symbol = lineage.type === 'motile' ? '◆' : '♧';
    const shortName = String(lineage.name || lineage.id).slice(0, 19);
    nodes += `<g class="tree-node ${lineage.type === 'motile' ? 'motile' : 'flora'}">
      <circle cx="${x}" cy="${y}" r="23"/>
      <text x="${x}" y="${y + 4}" text-anchor="middle" class="tree-symbol">${symbol}</text>
      <text x="${x}" y="${y + 38}" text-anchor="middle" class="tree-name">${shortName}</text>
      <text x="${x}" y="${y + 51}" text-anchor="middle" class="tree-gen">gen ${lineage.generation || 0}</text>
    </g>`;
  });
  return `<div class="tree-scroll"><svg class="tree-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${connectors}${nodes}</svg></div>`;
}

function install({ inspector, origin, root }) {
  if (window.realitySandboxEvolutionMorphologyV47c?.installed) return;

  const style = document.createElement('style');
  style.textContent = `
    .morphology-card { margin-top:11px; border-radius:10px; background:rgba(255,255,255,.038); overflow:hidden; }
    .morphology-head { display:flex; justify-content:space-between; align-items:center; padding:8px 10px 0; }
    .morphology-head b { font-size:9px; letter-spacing:.12em; text-transform:uppercase; opacity:.64; }
    .morphology-head span { font-size:8px; opacity:.40; }
    .morph-svg { display:block; width:100%; height:auto; min-height:140px; }
    .morph-svg .body { fill:rgba(133,204,153,.18); stroke:#9ad6a8; stroke-width:2; }
    .morph-svg .limb { fill:none; stroke:#a8d6ad; stroke-width:3; stroke-linecap:round; }
    .morph-svg .frond { fill:none; stroke:#8bcf91; stroke-width:2.2; stroke-linecap:round; }
    .morph-svg .leaf { fill:#84c58d; opacity:.8; }
    .morph-svg .eye { fill:#eaf7df; stroke:#6b9974; stroke-width:1; }
    .morph-svg .pupil { fill:#07120f; }
    .morph-svg .mouth { fill:none; stroke:#dcb29c; stroke-width:2; stroke-linecap:round; }
    .morph-svg .teeth { fill:none; stroke:#f4e6d2; stroke-width:1.4; }
    .morph-svg .plate { fill:rgba(188,204,193,.32); stroke:rgba(224,238,228,.45); stroke-width:1; }
    .morph-svg .toxin { fill:#d7a2e7; opacity:.82; }
    .morph-svg .social-ring { fill:none; stroke:rgba(129,207,161,.18); stroke-width:1.2; stroke-dasharray:4 5; }
    .morph-svg .social-ring.faint { opacity:.5; }
    .morph-svg .caption { fill:rgba(232,247,236,.54); font-size:9px; font-family:Inter,ui-sans-serif,system-ui,sans-serif; }
    .tree-section-v47c { margin-top:11px; }
    .tree-label-v47c { font-size:9px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; opacity:.58; margin:0 0 6px 2px; }
    .tree-scroll { overflow-x:auto; overflow-y:hidden; padding:4px 0 2px; scrollbar-width:thin; }
    .tree-svg { display:block; min-width:100%; }
    .tree-link { fill:none; stroke:rgba(155,210,170,.35); stroke-width:2; }
    .tree-node circle { fill:#0c2118; stroke:rgba(155,216,173,.48); stroke-width:1.5; }
    .tree-node.motile circle { fill:#102319; stroke:#a3dbac; }
    .tree-symbol { fill:#e3f4e6; font-size:15px; font-family:system-ui,sans-serif; }
    .tree-name { fill:rgba(232,247,236,.76); font-size:8px; font-family:Inter,system-ui,sans-serif; }
    .tree-gen { fill:rgba(232,247,236,.40); font-size:7px; font-family:Inter,system-ui,sans-serif; }
    .tree-empty { padding:9px; border-radius:8px; background:rgba(255,255,255,.03); font-size:9px; opacity:.55; }
  `;
  root.appendChild(style);

  const species = root.querySelector('.species');
  const ancestry = root.querySelector('.ancestry');
  if (!species || !ancestry) return;

  const morph = document.createElement('div');
  morph.className = 'morphology-card';
  morph.innerHTML = '<div class="morphology-head"><b>Genome morphology</b><span>schematic, not Surface renderer</span></div><div class="morphology-body"></div>';
  species.insertAdjacentElement('afterend', morph);

  const treeSection = document.createElement('div');
  treeSection.className = 'tree-section-v47c';
  treeSection.innerHTML = '<div class="tree-label-v47c">Evolution tree</div><div class="tree-body-v47c"></div>';
  ancestry.parentElement?.insertAdjacentElement('afterend', treeSection);

  let renders = 0;
  let lastSelected = null;

  function render() {
    const state = inspector.getStats?.() || {};
    const selectedId = state.selectedLineageId;
    const lineages = origin.getLineages?.() || [];
    const motiles = origin.getMotiles?.() || [];
    const byId = new Map(lineages.map(item => [item.id, item]));
    const lineage = selectedId ? byId.get(selectedId) : null;
    if (!lineage) {
      morph.querySelector('.morphology-body').innerHTML = '<div class="tree-empty">Select a lineage to derive its morphology.</div>';
      treeSection.querySelector('.tree-body-v47c').innerHTML = '<div class="tree-empty">No selected lineage.</div>';
      return;
    }

    const members = motiles.filter(item => item.lineageId === lineage.id);
    const genome = meanGenome(members, lineage.genome || {});
    morph.querySelector('.morphology-body').innerHTML = morphologySvg(lineage, genome);
    treeSection.querySelector('.tree-body-v47c').innerHTML = treeSvg(lineagePath(lineage, byId));
    lastSelected = lineage.id;
    renders++;
  }

  const originalOpen = inspector.open?.bind(inspector);
  const originalSelect = inspector.selectLineage?.bind(inspector);
  if (originalOpen) inspector.open = () => { const result = originalOpen(); queueMicrotask(render); return result; };
  if (originalSelect) inspector.selectLineage = id => { const result = originalSelect(id); queueMicrotask(render); return result; };

  const select = root.querySelector('.lineage-select');
  select?.addEventListener('change', () => queueMicrotask(render));

  let last = -Infinity;
  function loop(now) {
    requestAnimationFrame(loop);
    if (!inspector.isOpen?.() || now - last < UPDATE_MS) return;
    last = now;
    render();
  }
  requestAnimationFrame(loop);

  const api = {
    installed: true,
    render,
    getStats: () => ({
      installed: true,
      renders,
      selectedLineageId: lastSelected,
      genomeDrivenMorphology: true,
      ancestryTree: true,
      surfaceRendererTouched: false,
      svgOnly: true,
    }),
  };
  window.realitySandboxEvolutionMorphologyV47c = api;
  document.documentElement.dataset.evolutionMorphologyV47c = 'genome-svg-tree';
}

waitForInspector().then(install);
