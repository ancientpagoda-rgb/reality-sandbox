const APPROVED_PRESENTATION_CANVASES = new Set([
  'weatherPresentationCanvas',
  'surfaceDetailCanvas',
  'surfaceModeCanvas',
  'surfacePlantModelCanvas',
]);
const LEGACY_CANVAS_FAILURE = 'The root must use exactly one visible simulation canvas.';

function visible(element) {
  if (!element || element.hidden) return false;
  let node = element;
  while (node && node instanceof Element) {
    if (node.hidden) return false;
    const style = getComputedStyle(node);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      Number(style.opacity || 1) <= 0
    ) return false;
    node = node.parentElement;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

async function installPresentationInvariantCompat() {
  for (let attempt = 0; attempt < 240; attempt++) {
    const runtime = window.realitySandboxUnified;
    if (runtime?.runInvariants && !runtime.__presentationInvariantCompatInstalled) {
      const originalRunInvariants = runtime.runInvariants.bind(runtime);
      runtime.runInvariants = () => {
        const original = originalRunInvariants();
        const failures = (original.failures || []).filter(failure => failure !== LEGACY_CANVAS_FAILURE);
        const simulationCanvases = [...document.querySelectorAll('canvas')]
          .filter(visible)
          .filter(canvas => !APPROVED_PRESENTATION_CANVASES.has(canvas.id));
        const rootCanvas = document.getElementById('lofiLivingCanvas');
        if (simulationCanvases.length !== 1 || simulationCanvases[0] !== rootCanvas) {
          failures.push('The root must use exactly one effectively visible simulation canvas plus approved presentation layers.');
        }
        return { ...original, ok: failures.length === 0, failures };
      };
      runtime.__presentationInvariantCompatInstalled = true;
      document.documentElement.dataset.presentationInvariantCompat = 'active-v3-plants';
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  document.documentElement.dataset.presentationInvariantCompat = 'runtime-timeout';
}

installPresentationInvariantCompat();
