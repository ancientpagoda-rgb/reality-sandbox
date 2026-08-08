import './pointer-lock-compat.js?v=20260808-surface-v26';
import './surface-mode-gpu-controller.js?v=20260808-surface-v26';
import './surface-performance.js?v=20260808-surface-v26';
import './surface-cpu-relief.js?v=20260808-surface-v26';
import './surface-gpu.js?v=20260808-surface-v26';
import './surface-gpu-backend-diagnostics.js?v=20260808-surface-v26';
import './surface-mobile-controls.js?v=20260808-surface-v26';
import './presentation-invariant-compat.js?v=20260808-surface-v26';

const SURFACE_BUILD = 'surface-v26-gpu-cpu-relief';
window.realitySandboxSurfaceBuild = SURFACE_BUILD;
document.documentElement.dataset.surfaceBuild = SURFACE_BUILD;
