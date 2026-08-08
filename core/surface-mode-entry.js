import './pointer-lock-compat.js?v=20260808-surface-v32';
import './surface-mode-gpu-controller.js?v=20260808-surface-v32';
import './surface-cpu-relief.js?v=20260808-surface-v32';
import './surface-terrain-water-gpu-v32.js?v=20260808-surface-v32';
import './surface-gpu-backend-diagnostics.js?v=20260808-surface-v32';
import './surface-mobile-controls.js?v=20260808-surface-v32';
import './presentation-invariant-compat.js?v=20260808-surface-v32';

const SURFACE_BUILD = 'surface-v32-cached-water-lod-rings';
window.realitySandboxSurfaceBuild = SURFACE_BUILD;
document.documentElement.dataset.surfaceBuild = SURFACE_BUILD;
