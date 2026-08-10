const UPDATE_MS = 1000;

async function waitForRuntime() {
  while (true) {
    const social = window.realitySandboxSocialModelsV57;
    const inspector = window.realitySandboxEvolutionInspectorV47b;
    const host = document.getElementById('evolutionInspectorV47bHost');
    if (social?.installed && inspector?.installed && host?.shadowRoot) {
      return { social, inspector, root:host.shadowRoot };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function install({ social, inspector, root }) {
  if (window.realitySandboxSocialModelsInspectorV57a?.installed) return;

  const style = document.createElement('style');
  style.textContent = `
    .social-v57 { margin-top:11px; }
    .social-v57-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; }
    .social-v57-card { padding:8px; border-radius:9px; background:rgba(255,255,255,.038); }
    .social-v57-card b { display:block; font-size:13px; }
    .social-v57-card span { display:block; margin-top:3px; font-size:8px; text-transform:uppercase; letter-spacing:.06em; opacity:.5; }
    .social-v57-list { margin-top:7px; display:grid; gap:4px; }
    .social-v57-row { display:grid; grid-template-columns:minmax(0,1fr) auto auto auto; gap:5px; align-items:center; padding:5px 6px; border-radius:6px; background:rgba(255,255,255,.045); font-size:8px; }
    .social-v57-row b { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .social-v57-note { margin-top:7px; padding:7px 8px; border-radius:8px; background:rgba(132,205,154,.07); font-size:8px; line-height:1.45; opacity:.7; }
  `;
  root.appendChild(style);

  const intentSection = root.querySelector('.intent-v56');
  const compositionSection = root.querySelector('.composition-v55');
  const anchor = intentSection || compositionSection || root.querySelector('.language-v54') || root.querySelector('.culture-v53') || root.querySelector('.behavior')?.closest('.section');
  if (!anchor) return;

  const section = document.createElement('div');
  section.className = 'section social-v57';
  section.innerHTML = '<div class="section-label">Social models</div><div class="social-v57-body"></div>';
  anchor.insertAdjacentElement('afterend', section);

  let renders = 0;
  let last = 0;

  function render() {
    const selected = inspector.getStats?.().selectedLineageId;
    const population = social.getPopulationSocialModels?.() || [];
    const lineage = selected ? population.filter(item => item.lineageId === selected) : [];
    const global = social.getStats?.() || {};
    const body = section.querySelector('.social-v57-body');

    if (!selected) {
      body.innerHTML = '<div class="empty">Select a lineage to inspect learned partner models.</div>';
      renders++;
      return;
    }

    let modeledIndividuals = 0;
    let preferred = 0;
    let inference = 0;
    let memory = 0;
    const aggregate = new Map();

    for (const item of lineage) {
      const state = item.socialModel;
      if (!state) continue;
      inference += Number(state.socialInference) || 0;
      memory += Number(state.partnerMemory) || 0;
      if (state.preferredPartnerId != null) preferred++;
      for (const [partnerId, model] of Object.entries(state.models || {})) {
        modeledIndividuals++;
        const key = String(partnerId);
        const current = aggregate.get(key) || {
          trust:0, responsiveness:0, familiarity:0, food:0, danger:0, prey:0, observers:0, evidence:0,
        };
        current.trust += Number(model.trust) || 0;
        current.responsiveness += Number(model.responsiveness) || 0;
        current.familiarity += Number(model.familiarity) || 0;
        current.food += Number(model.knowledge?.food) || 0;
        current.danger += Number(model.knowledge?.danger) || 0;
        current.prey += Number(model.knowledge?.prey) || 0;
        current.evidence +=
          Number(model.successfulResponses || 0) +
          Number(model.failedResponses || 0) +
          Number(model.reliableClaims || 0) +
          Number(model.unreliableClaims || 0);
        current.observers++;
        aggregate.set(key, current);
      }
    }

    const n = lineage.length || 1;
    const rows = [...aggregate.entries()]
      .map(([partnerId, value]) => {
        const d = value.observers || 1;
        return {
          partnerId,
          trust:value.trust / d,
          responsiveness:value.responsiveness / d,
          familiarity:value.familiarity / d,
          knowledge:Math.max(value.food, value.danger, value.prey) / d,
          evidence:value.evidence,
        };
      })
      .sort((a,b) => (b.evidence - a.evidence) || (b.responsiveness - a.responsiveness) || (b.trust - a.trust))
      .slice(0, 8);

    body.innerHTML = `
      <div class="social-v57-grid">
        <div class="social-v57-card"><b>${modeledIndividuals}</b><span>partner models</span></div>
        <div class="social-v57-card"><b>${preferred}</b><span>selective attention</span></div>
        <div class="social-v57-card"><b>${(inference/n).toFixed(2)}</b><span>social inference</span></div>
      </div>
      <div class="social-v57-list">${rows.length ? rows.map(row => `
        <div class="social-v57-row">
          <b>partner ${row.partnerId}</b>
          <span>trust ${signed(row.trust)}</span>
          <span>response ${signed(row.responsiveness)}</span>
          <span>knowledge ${row.knowledge.toFixed(2)} · n=${row.evidence}</span>
        </div>`).join('') : '<span class="empty">No individual partner history learned yet.</span>'}
      </div>
      <div class="social-v57-note">
        Mean partner memory ${(memory/n).toFixed(2)}. Global response updates ${global.outgoingOutcomeUpdates || 0}; speaker-outcome checks ${global.speakerOutcomeChecks || 0}; reliable claims ${global.speakerTrustReinforcements || 0}; corrected claims ${global.speakerTrustExtinctions || 0}; socially biased audience scores ${global.sociallyBiasedAudienceScores || 0}.
      </div>`;
    renders++;
  }

  function signed(value) {
    const n = Number(value) || 0;
    return `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;
  }

  const originalSelect = inspector.selectLineage?.bind(inspector);
  if (originalSelect) {
    inspector.selectLineage = id => {
      const result = originalSelect(id);
      queueMicrotask(render);
      return result;
    };
  }
  root.querySelector('.lineage-select')?.addEventListener('change', () => queueMicrotask(render));

  function loop(now) {
    requestAnimationFrame(loop);
    if (!inspector.isOpen?.() || now - last < UPDATE_MS) return;
    last = now;
    render();
  }
  requestAnimationFrame(loop);
  render();

  window.realitySandboxSocialModelsInspectorV57a = {
    installed:true,
    render,
    getStats:() => ({
      installed:true,
      renders,
      lineageSocialModelView:true,
      individualPartnerView:true,
      trustView:true,
      responsivenessView:true,
      inferredKnowledgeView:true,
      selectiveAttentionView:true,
    }),
  };
  document.documentElement.dataset.socialModelsInspectorV57a = 'ready';
}

waitForRuntime().then(install);
