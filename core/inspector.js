export function createInspector(world) {
  const emptyEl = document.getElementById('inspectorEmpty');
  const panelEl = document.getElementById('inspectorPanel');

  let selectedId = null;

  function renderInspector() {
    if (!panelEl || !emptyEl) return;
    if (selectedId == null) {
      panelEl.hidden = true;
      emptyEl.hidden = false;
      panelEl.innerHTML = '';
      return;
    }

    const { ecs } = world;
    const { position, velocity, agent, resource } = ecs.components;

    const pos = position.get(selectedId);
    const vel = velocity.get(selectedId);
    const ag = agent.get(selectedId);
    const res = resource.get(selectedId);

    panelEl.hidden = false;
    emptyEl.hidden = true;

    const fields = [];

    if (pos) {
      fields.push({ label: 'x', path: ['position', 'x'], value: pos.x.toFixed(1) });
      fields.push({ label: 'y', path: ['position', 'y'], value: pos.y.toFixed(1) });
    }
    if (vel) {
      fields.push({ label: 'vx', path: ['velocity', 'vx'], value: vel.vx.toFixed(1) });
      fields.push({ label: 'vy', path: ['velocity', 'vy'], value: vel.vy.toFixed(1) });
    }
    if (ag) {
      fields.push({ label: 'energy', path: ['agent', 'energy'], value: ag.energy.toFixed(2) });
      fields.push({ label: 'colorHue', path: ['agent', 'colorHue'], value: ag.colorHue });
    }
    if (res) {
      fields.push({ label: 'amount', path: ['resource', 'amount'], value: res.amount.toFixed(2) });
    }

    panelEl.innerHTML = '';

    const title = document.createElement('div');
    title.textContent = `Entity ${selectedId}`;
    title.style.marginBottom = '0.4rem';
    panelEl.appendChild(title);

    fields.forEach((f) => {
      const label = document.createElement('label');
      label.textContent = f.label;
      const input = document.createElement('input');
      input.value = f.value;
      input.addEventListener('change', () => {
        const num = Number(input.value);
        if (!Number.isFinite(num)) return;
        const [compName, key] = f.path;
        const compMap = ecs.components[compName];
        const obj = compMap.get(selectedId);
        if (!obj) return;
        obj[key] = num;
      });
      label.appendChild(input);
      panelEl.appendChild(label);
    });
  }

  function inspectAt(point) {
    const { ecs } = world;
    const { position, agent, resource } = ecs.components;
    const hitRadius = 8;

    let closestId = null;
    let closestDist2 = Infinity;

    for (const id of ecs.entities) {
      const pos = position.get(id);
      if (!pos) continue;
      const dx = pos.x - point.x;
      const dy = pos.y - point.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < hitRadius * hitRadius && d2 < closestDist2 && (agent.has(id) || resource.has(id))) {
        closestId = id;
        closestDist2 = d2;
      }
    }

    selectedId = closestId;
    renderInspector();
  }

  function refresh() {
    if (selectedId != null) renderInspector();
  }

  return {
    inspectAt,
    refresh,
  };
}
