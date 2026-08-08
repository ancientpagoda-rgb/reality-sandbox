import './pointer-lock-compat.js?v=20260808-surface-v24';
import './surface-mode.js?v=20260808-surface-v24';
import './surface-performance.js?v=20260808-surface-v24';
import './surface-gpu.js?v=20260808-surface-v24';
import './surface-camera-performance.js?v=20260808-surface-v24';
import './surface-mobile-controls.js?v=20260808-surface-v24';
import './surface-mode-dblclick-bridge.js?v=20260808-surface-v24';
import './presentation-invariant-compat.js?v=20260808-surface-v24';

const SURFACE_BUILD = 'surface-v24-gpu-primary';
window.realitySandboxSurfaceBuild = SURFACE_BUILD;
document.documentElement.dataset.surfaceBuild = SURFACE_BUILD;
