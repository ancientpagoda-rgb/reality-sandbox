import './pointer-lock-compat.js?v=20260808-surface-v35';
import './surface-mode-sphere-controller-v33.js?v=20260808-surface-v35';
import './surface-cpu-relief.js?v=20260808-surface-v35';
import './surface-idle-scheduler-v34.js?v=20260808-surface-v35';
import './surface-terrain-water-sphere-gpu-v35.js?v=20260808-surface-v35';
import './surface-celestials-v35.js?v=20260808-surface-v35';
import './surface-gpu-backend-diagnostics.js?v=20260808-surface-v35';
import './surface-mobile-controls.js?v=20260808-surface-v35';
import './presentation-invariant-compat.js?v=20260808-surface-v35';

const SURFACE_BUILD = 'surface-v35-stable-sky-opaque-water';
window.realitySandboxSurfaceBuild = SURFACE_BUILD;
document.documentElement.dataset.surfaceBuild = SURFACE_BUILD;
