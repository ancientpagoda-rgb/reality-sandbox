import './pointer-lock-compat.js?v=20260808-surface-v23';
import './surface-mode.js?v=20260808-surface-v23';
import './surface-performance.js?v=20260808-surface-v23';
import './surface-camera-performance.js?v=20260808-surface-v23';
import './surface-mobile-controls.js?v=20260808-surface-v23';
import './surface-mode-dblclick-bridge.js?v=20260808-surface-v23';
import './presentation-invariant-compat.js?v=20260808-surface-v23';

const SURFACE_BUILD = 'surface-v23-camera-cachefix';
window.realitySandboxSurfaceBuild = SURFACE_BUILD;
document.documentElement.dataset.surfaceBuild = SURFACE_BUILD;
