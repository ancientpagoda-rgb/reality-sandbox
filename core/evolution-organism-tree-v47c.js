const UPDATE_MS = 900;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number(v) || 0));

async function waitForInspector() {
  while (true) {
    const inspector = window.realitySandboxEvolutionInspectorV47b;
    const origin = window.realitySandboxOriginMotileLifeV47;
    const host = document.getElementById('evolutionInspectorV47bHost');
    if (inspector?.installed && origin?.installed && host?.shadowRoot) return { inspector, origin, root: host.shadowRoot };
    await new Promise(resolve => setTimeout(resolve, 120));
  }
}

function meanGenome(members, fallback = {}) {
  if (!members.length) return fallback;
  const keys = ['photosynthesis','heterotrophy','motility','sense','brainSpeed','sociality','dormancy','scavenging','aggression','toxin','neurotoxin','armor','metabolism','bodySize','seedInvestment'];
  const out = {};
  for (const key of keys) out[key] = members.reduce((sum, member) => sum + (Number(member.genome?.[key]) || 0), 0) / members.length;
  return out;
}

function classification(g, fallback = 'plant') {
  if (!g) return fallback;
  if ((g.aggression || 0) > .62 && (g.heterotrophy || 0) > .64) return 'predatory motile';
  if ((g.scavenging || 0) > .62 && (g.heterotrophy || 0) > .48) return 'scavenger';
  if ((g.heterotrophy || 0) > .56 && (g.photosynthesis || 0) < .45) return 'heterotroph';
  if ((g.heterotrophy || 0) > .28 && (g.motility || 0) > .30) return 'mixotroph';
  if ((g.motility || 0) > .18) return 'motile photoautotroph';
  return fallback;
}

function organismSvg(g, type) {
  const body = clamp(g.bodySize);
  const motility = clamp(g.motility);
  const sense = clamp(g.sense);
  const brain = clamp(g.brainSpeed);
  const armor = clamp(g.armor);
  const toxin = clamp(g.toxin);
  const aggression = clamp(g.aggression);
  const photo = clamp(g.photosynthesis);
  const hetero = clamp(g.heterotrophy);
  const social = clamp(g.sociality);
  const rx = 36 + body * 28;
  const ry = 19 + body * 18;
  const limbs = type === 'photosynthetic' ? Math.round(2 + motility * 2) : Math.round(2 + motility * 6);
  const eyeCount = sense < .22 ? 0 : sense < .52 ? 1 : sense < .78 ? 2 : 4;
  const spikes = Math.round(armor * 7);
  const leafCount = Math.round(photo * 5);
  const mouth = hetero > .16;
  const mouthWidth = 8 + hetero * 18;
  const hue = Math.round(85 + photo * 55 - hetero * 40 + toxin * 75);
  const sat = Math.round(40 + toxin * 38 + aggression * 15);
  const light = Math.round(42 + (1 - armor) * 12);
  let extra = '';

  for (let i = 0; i < limbs; i++) {
    const t = limbs === 1 ? .5 : i / (limbs - 1);
    const x = 120 - rx + t * rx * 2;
    const side = i % 2 ? 1 : -1;
    const len = 12 + motility * 24;
    extra += `<path d="M${x.toFixed(1)} ${90 + side * ry * .55} q${side * 4} ${side * 10} ${side * 2} ${side * len}" class="limb"/>`;
  }
  for (let i = 0; i < eyeCount; i++) {
    const y = 83 + (i % 2) * 14;
    const x = 120 + rx * .55 + Math.floor(i / 2) * 7;
    extra += `<circle cx="${x}" cy="${y}" r="${2.2 + sense * 2.2}" class="eye"/>`;
  }
  for (let i = 0; i < spikes; i++) {
    const t = spikes === 1 ? .5 : i / (spikes - 1);
    const x = 120 - rx * .75 + t * rx * 1.5;
    extra += `<path d="M${x.toFixed(1)} ${90 - ry * .72} l0 ${-(6 + armor * 10)} l6 ${7 + armor * 5}" class="spike"/>`;
  }
  for (let i = 0; i < leafCount; i++) {
    const angle = -1.3 + i * (2.6 / Math.max(1, leafCount - 1));
    const x1 = 120 + Math.cos(angle) * rx * .72;
    const y1 = 90 + Math.sin(angle) * ry * .72;
    const x2 = x1 + Math.cos(angle) * (10 + photo * 10);
    const y2 = y1 + Math.sin(angle) * (10 + photo * 10);
    extra += `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} Q${((x1+x2)/2+5).toFixed(1)} ${((y1+y2)/2-4).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}" class="leaf"/>`;
  }
  if (mouth) extra += `<path d="M${120 + rx * .58} 96 q${mouthWidth * .5} ${6 + aggression * 8} ${mouthWidth} 0" class="mouth"/>`;

  return `<svg class="organism-svg" viewBox="0 0 240 180" role="img" aria-label="Genome-derived organism schematic">
    <defs><radialGradient id="bodyGrad"><stop offset="0" stop-color="hsl(${hue} ${sat}% ${Math.min(72, light + 14)}%)"/><stop offset="1" stop-color="hsl(${hue} ${sat}% ${light}%)"/></radialGradient></defs>
    <ellipse cx="120" cy="90" rx="${rx}" ry="${ry}" fill="url(#bodyGrad)" class="body"/>
    <ellipse cx="${106 - brain * 8}" cy="82" rx="${8 + brain * 13}" ry="${6 + brain * 9}" class="brain"/>
    ${extra}
    <text x="12" y="164" class="caption">${classification(g, type === 'photosynthetic' ? 'plant' : type)}</text>
    <text x="228" y="164" text-anchor="end" class="caption">genome schematic</text>
  </svg>`;
}

function renderTree(lineages, ancestry, selectedId) {
  if (!lineages.length) return '<div class="tree-empty">No lineages yet.</div>';
  const byId = new Map(lineages.map(x => [x.id, x]));
  const children = new Map();
  for (const lineage of lineages) {
    if (!lineage.parentId) continue;
    if (!children.has(lineage.parentId)) children.set(lineage.parentId, []);
    children.get(lineage.parentId).push(lineage.id);
  }
  const roots = lineages.filter(x => !x.parentId);
  const ancestryByChild = new Map(ancestry.map(x => [x.childId, x]));
  const renderNode = (id, depth = 0, seen = new Set()) => {
    if (seen.has(id) || depth > 14) return '';
    const lineage = byId.get(id);
    if (!lineage) return '';
    const nextSeen = new Set(seen); nextSeen.add(id);
    const kids = children.get(id) || [];
    const event = ancestryByChild.get(id);
    const selected = id === selectedId ? ' selected' : '';
    return `<div class="tree-node depth-${Math.min(depth, 6)}">
      <button class="tree-lineage${selected}" data-lineage-id="${id}" type="button">
        <span class="tree-symbol">${lineage.type === 'motile' ? '◆' : '♧'}</span>
        <span class="tree-name">${lineage.name}</span>
        <span class="tree-meta">${lineage.form || lineage.type} · pop ${lineage.population || 0}${event?.tick != null ? ` · t${event.tick}` : ''}</span>
      </button>
      ${kids.length ? `<div class="tree-children">${kids.map(child => renderNode(child, depth + 1, nextSeen)).join('')}</div>` : ''}
    </div>`;
  };
  return roots.map(root => renderNode(root.id)).join('');
}

function install({ inspector, origin, root }) {
  if (window.realitySandboxEvolutionOrganismTreeV47c?.installed) return;
  const style = document.createElement('style');
  style.textContent = `
    .morph-card{margin-top:11px;padding:9px;border-radius:10px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.06)}
    .organism-svg{display:block;width:100%;height:auto;max-height:190px;border-radius:8px;background:radial-gradient(circle at 50% 45%,rgba(78,120,94,.15),rgba(0,0,0,.05));overflow:visible}
    .organism-svg .body{stroke:rgba(230,255,237,.52);stroke-width:1.3}.organism-svg .limb,.organism-svg .spike,.organism-svg .leaf,.organism-svg .mouth{fill:none;stroke:#d5f0dc;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.organism-svg .leaf{stroke:#9de0a9}.organism-svg .spike{stroke:#d9dcc8}.organism-svg .mouth{stroke:#f1d9c2}.organism-svg .eye{fill:#effcf2;stroke:#183524;stroke-width:1}.organism-svg .brain{fill:rgba(226,190,255,.34);stroke:rgba(239,214,255,.68);stroke-width:1}.organism-svg .caption{font:8px ui-sans-serif,system-ui;fill:rgba(237,247,239,.62);text-transform:uppercase;letter-spacing:.08em}
    .tree-wrap{max-height:230px;overflow:auto;padding:6px;border-radius:9px;background:rgba(0,0,0,.13);scrollbar-width:thin}.tree-node{position:relative}.tree-children{margin-left:15px;padding-left:8px;border-left:1px solid rgba(151,220,171,.18)}.tree-lineage{display:grid;width:100%;grid-template-columns:16px 1fr;grid-template-areas:'sym name' 'sym meta';gap:1px 4px;text-align:left;border:0;background:transparent;color:#deeee2;padding:5px 4px;border-radius:7px;cursor:pointer}.tree-lineage:hover{background:rgba(255,255,255,.045)}.tree-lineage.selected{background:rgba(116,203,141,.13);outline:1px solid rgba(116,203,141,.24)}.tree-symbol{grid-area:sym;opacity:.72}.tree-name{grid-area:name;font-size:9px;font-weight:700}.tree-meta{grid-area:meta;font-size:7px;opacity:.45}.tree-empty{font-size:9px;opacity:.5;padding:7px}
  `;
  root.appendChild(style);

  const species = root.querySelector('.species');
  const traitsSection = root.querySelector('.traits')?.closest('.section');
  const behaviorSection = root.querySelector('.behavior')?.closest('.section');
  if (!species || !traitsSection || !behaviorSection) return;

  const morphologySection = document.createElement('div');
  morphologySection.className = 'section morphology-v47c';
  morphologySection.innerHTML = '<div class="section-label">Genome-derived form</div><div class="morph-card"></div>';
  traitsSection.before(morphologySection);

  const treeSection = document.createElement('div');
  treeSection.className = 'section lineage-tree-v47c';
  treeSection.innerHTML = '<div class="section-label">Lineage tree</div><div class="tree-wrap"></div>';
  behaviorSection.after(treeSection);

  let selectedId = null;
  let renders = 0;
  let last = 0;

  function render() {
    const lineages = origin.getLineages?.() || [];
    const ancestry = origin.getAncestry?.() || [];
    const motiles = origin.getMotiles?.() || [];
    const inspectorStats = inspector.getStats?.() || {};
    selectedId = inspectorStats.selectedLineageId || selectedId || lineages[0]?.id || null;
    const lineage = lineages.find(x => x.id === selectedId) || lineages[0];
    if (!lineage) {
      morphologySection.querySelector('.morph-card').innerHTML = '<div class="tree-empty">Waiting for a lineage.</div>';
      treeSection.querySelector('.tree-wrap').innerHTML = '<div class="tree-empty">Waiting for ancestry.</div>';
      return;
    }
    const members = motiles.filter(x => x.lineageId === lineage.id);
    const genome = meanGenome(members, lineage.genome || {});
    morphologySection.querySelector('.morph-card').innerHTML = organismSvg(genome, lineage.type);
    treeSection.querySelector('.tree-wrap').innerHTML = renderTree(lineages, ancestry, lineage.id);
    for (const button of treeSection.querySelectorAll('[data-lineage-id]')) {
      button.addEventListener('click', () => inspector.selectLineage(button.dataset.lineageId));
    }
    renders++;
  }

  const select = root.querySelector('.lineage-select');
  select?.addEventListener('change', () => setTimeout(render, 0));
  treeSection.addEventListener('click', () => setTimeout(render, 0));

  function loop(now) {
    requestAnimationFrame(loop);
    if (!inspector.isOpen?.() || now - last < UPDATE_MS) return;
    last = now;
    render();
  }
  requestAnimationFrame(loop);
  render();

  window.realitySandboxEvolutionOrganismTreeV47c = {
    installed: true,
    render,
    getStats: () => ({ installed:true, selectedLineageId:selectedId, renders, genomeDrivenSchematic:true, clickableLineageTree:true, surfaceFaunaRendererTouched:false }),
  };
  document.documentElement.dataset.evolutionOrganismTreeV47c = 'ready';
}

waitForInspector().then(install);
