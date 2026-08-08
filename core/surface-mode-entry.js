import './pointer-lock-compat.js?v=20260808-surface-v31b';
import './surface-mode-gpu-controller.js?v=20260808-surface-v31b';
import './surface-cpu-relief.js?v=20260808-surface-v31b';
import './surface-terrain-gpu-v31b.js?v=20260808-surface-v31b';
import './surface-gpu-backend-diagnostics.js?v=20260808-surface-v31b';
import './surface-mobile-controls.js?v=20260808-surface-v31b';
import './presentation-invariant-compat.js?v=20260808-surface-v31b';

const SURFACE_BUILD = 'surface-v31b-cached-terrain-only';
window.realitySandboxSurfaceBuild = SURFACE_BUILD;
document.documentElement.dataset.surfaceBuild = SURFACE_BUILD;
