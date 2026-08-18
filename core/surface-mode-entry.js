import './pointer-lock-compat.js?v=20260808-surface-v46e';
import './surface-mode-sphere-controller-v33.js?v=20260808-surface-v46e';
import './surface-globe-presentation-v73.js?v=20260817-surface-globe-v73b-continuous';
import './presentation-invariant-compat.js?v=20260817-root-invariant-v2';
import './surface-wide-pitch-v46d.js?v=20260808-surface-v46e';
import './surface-flight-v38.js?v=20260808-surface-v46e';
import './surface-mobile-controls.js?v=20260808-surface-v46e';
import './evolutionary-ecology-v45.js?v=20260808-surface-v46e';
import './ecological-migration-v46.js?v=20260808-surface-v46e';
import './ecological-migration-velocity-guard-v46.js?v=20260808-surface-v46e';
import './runevale-settlement-foundation-v68.js?v=20260811-runevale-settlement-v68a';
import './runevale-settlement-build-orientation-v68b.js?v=20260811-runevale-settlement-orientation-v68b';
import './runevale-castle-perimeters-v69.js?v=20260811-runevale-castle-perimeters-v69a';
import './runevale-castle-perimeters-v69-contract.js?v=20260811-runevale-castle-perimeters-v69a-contract';
import './runevale-wall-runs-v70.js?v=20260811-runevale-wall-runs-v70a';
import './runevale-gatehouse-retrofits-v71.js?v=20260811-runevale-gatehouse-retrofits-v71a';
import './runevale-corner-towers-v72.js?v=20260811-runevale-corner-towers-v72a';

const SURFACE_BUILD = 'surface-v48-morphogenesis-body-plans';
let detailLoadPromise = null;

window.realitySandboxSurfaceBuild = SURFACE_BUILD;
document.documentElement.dataset.surfaceBuild = SURFACE_BUILD;
document.documentElement.dataset.surfaceFaunaPolicy = 'motile-life-evolves-no-surface-renderer-yet';
document.documentElement.dataset.surfacePresentationPolicy = 'canonical-globe';
document.documentElement.dataset.surfaceLegacyDetail = 'available-on-demand';

function loadLegacyDetailSupport() {
  if (detailLoadPromise) return detailLoadPromise;
  document.documentElement.dataset.surfaceLegacyDetail = 'loading';
  detailLoadPromise = (async () => {
    await import('./surface-cpu-relief.js?v=20260817-lazy-surface-detail-v2');
    await import('./surface-idle-scheduler-v34.js?v=20260817-lazy-surface-detail-v2');
    await import('./surface-light-hook-v36.js?v=20260817-lazy-surface-detail-v2');
    await import('./surface-water-stability-v38b.js?v=20260817-lazy-surface-detail-v2');
    await import('./surface-oss-consolidation-v40.js?v=20260817-lazy-surface-detail-v2');
    await import('./surface-terrain-water-sphere-gpu-v37.js?v=20260817-lazy-surface-detail-v2');
    await Promise.all([
      import('./surface-rivers-v41.js?v=20260817-lazy-surface-detail-v2'),
      import('./surface-celestials-v38.js?v=20260817-lazy-surface-detail-v2'),
      import('./surface-solar-lighting-v36.js?v=20260817-lazy-surface-detail-v2'),
      import('./surface-vegetation-v38.js?v=20260817-lazy-surface-detail-v2'),
      import('./surface-vegetation-stability-v38b.js?v=20260817-lazy-surface-detail-v2'),
      import('./surface-horizon-v38.js?v=20260817-lazy-surface-detail-v2'),
      import('./surface-weather-v39.js?v=20260817-lazy-surface-detail-v2'),
      import('./surface-large-planet-coverage-v43.js?v=20260817-lazy-surface-detail-v2'),
      import('./surface-gpu-backend-diagnostics.js?v=20260817-lazy-surface-detail-v2'),
    ]);
    await import('./runevale-settlement-sphere-gpu-v68a.js?v=20260817-lazy-surface-detail-v2');
    document.documentElement.dataset.surfaceLegacyDetail = 'loaded';
    return true;
  })().catch(error => {
    document.documentElement.dataset.surfaceLegacyDetail = 'failed';
    document.documentElement.dataset.surfaceLegacyDetailError = String(error?.message || error || 'unknown');
    console.warn('Optional legacy Surface detail failed to load:', error);
    return false;
  });
  return detailLoadPromise;
}

window.realitySandboxLoadLegacySurfaceDetail = loadLegacyDetailSupport;
