import './pointer-lock-compat.js?v=20260808-surface-v25';
import './surface-mode-gpu-controller.js?v=20260808-surface-v25';
import './surface-performance.js?v=20260808-surface-v25';
import './surface-gpu.js?v=20260808-surface-v25';
import './surface-mobile-controls.js?v=20260808-surface-v25';
import './presentation-invariant-compat.js?v=20260808-surface-v25';

const SURFACE_BUILD = 'surface-v25-gpu-only';
window.realitySandboxSurfaceBuild = SURFACE_BUILD;
document.documentElement.dataset.surfaceBuild = SURFACE_BUILD;
