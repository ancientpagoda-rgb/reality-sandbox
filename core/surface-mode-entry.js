import './pointer-lock-compat.js?v=20260808-surface-v33';
import './surface-mode-sphere-controller-v33.js?v=20260808-surface-v33';
import './surface-cpu-relief.js?v=20260808-surface-v33';
import './surface-terrain-water-sphere-gpu-v33.js?v=20260808-surface-v33';
import './surface-gpu-backend-diagnostics.js?v=20260808-surface-v33';
import './surface-mobile-controls.js?v=20260808-surface-v33';
import './presentation-invariant-compat.js?v=20260808-surface-v33';

const SURFACE_BUILD = 'surface-v33-spherical-water-lod-rings';
window.realitySandboxSurfaceBuild = SURFACE_BUILD;
document.documentElement.dataset.surfaceBuild = SURFACE_BUILD;
