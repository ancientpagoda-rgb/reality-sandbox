import './pointer-lock-compat.js?v=20260808-surface-v29';
import './surface-mode-gpu-controller.js?v=20260808-surface-v29';
import './surface-cpu-relief.js?v=20260808-surface-v29';
import './surface-flat-gpu-diagnostic.js?v=20260808-surface-v29';
import './surface-gpu-backend-diagnostics.js?v=20260808-surface-v29';
import './surface-mobile-controls.js?v=20260808-surface-v29';
import './presentation-invariant-compat.js?v=20260808-surface-v29';

const SURFACE_BUILD = 'surface-v29-flat-gpu-isolation';
window.realitySandboxSurfaceBuild = SURFACE_BUILD;
document.documentElement.dataset.surfaceBuild = SURFACE_BUILD;
