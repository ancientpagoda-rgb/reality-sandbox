import './pointer-lock-compat.js?v=20260808-surface-v31';
import './surface-mode-gpu-controller.js?v=20260808-surface-v31';
import './surface-cpu-relief.js?v=20260808-surface-v31';
import './surface-terrain-gpu-v31.js?v=20260808-surface-v31';
import './surface-gpu-backend-diagnostics.js?v=20260808-surface-v31';
import './surface-mobile-controls.js?v=20260808-surface-v31';
import './presentation-invariant-compat.js?v=20260808-surface-v31';

const SURFACE_BUILD = 'surface-v31-cached-terrain-only';
window.realitySandboxSurfaceBuild = SURFACE_BUILD;
document.documentElement.dataset.surfaceBuild = SURFACE_BUILD;
