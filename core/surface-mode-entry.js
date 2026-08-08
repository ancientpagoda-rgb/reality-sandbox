import './pointer-lock-compat.js?v=20260808-surface-v30';
import './surface-mode-gpu-controller.js?v=20260808-surface-v30';
import './surface-cpu-relief.js?v=20260808-surface-v30';
import './surface-flat-gpu-diagnostic.js?v=20260808-surface-v30';
import './surface-gpu-backend-diagnostics.js?v=20260808-surface-v30';
import './surface-mobile-controls.js?v=20260808-surface-v30';
import './presentation-invariant-compat.js?v=20260808-surface-v30';

const SURFACE_BUILD = 'surface-v30-flat-gpu-smooth-checkpoint';
window.realitySandboxSurfaceBuild = SURFACE_BUILD;
document.documentElement.dataset.surfaceBuild = SURFACE_BUILD;
