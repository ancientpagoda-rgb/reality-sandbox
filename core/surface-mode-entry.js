import './pointer-lock-compat.js?v=20260808-surface-v28';
import './surface-mode-gpu-controller.js?v=20260808-surface-v28';
import './surface-performance.js?v=20260808-surface-v28';
import './surface-cpu-relief.js?v=20260808-surface-v28';
import './surface-simulation-budget.js?v=20260808-surface-v28';
import './surface-creature-isolation.js?v=20260808-surface-v28';
import './surface-gpu.js?v=20260808-surface-v28';
import './surface-gpu-backend-diagnostics.js?v=20260808-surface-v28';
import './surface-mobile-controls.js?v=20260808-surface-v28';
import './presentation-invariant-compat.js?v=20260808-surface-v28';

const SURFACE_BUILD = 'surface-v28-no-creatures-diagnostic';
window.realitySandboxSurfaceBuild = SURFACE_BUILD;
document.documentElement.dataset.surfaceBuild = SURFACE_BUILD;
