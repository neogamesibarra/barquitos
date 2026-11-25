/** @typedef {HTMLElement & {webkitRequestFullscreen?: () => void}} FullscreenRoot */
/** @typedef {Document & {webkitFullscreenEnabled?: boolean, webkitFullscreenElement?: Element, webkitExitFullscreen?: () => void}} FullscreenDocument */

function fullscreenRequest() {
  const root = /** @type {FullscreenRoot} */ (document.documentElement);
  const browser = /** @type {FullscreenDocument} */ (document);
  if (typeof root?.requestFullscreen === "function" && browser.fullscreenEnabled !== false) {
    return () => root.requestFullscreen();
  }
  if (typeof root?.webkitRequestFullscreen === "function" && browser.webkitFullscreenEnabled !== false) {
    return () => root.webkitRequestFullscreen();
  }
  return null;
}

function isDocumentFullscreen() {
  return Boolean(document.fullscreenElement || /** @type {FullscreenDocument} */ (document).webkitFullscreenElement);
}

async function toggleDocumentFullscreen() {
  const browser = /** @type {FullscreenDocument} */ (document);
  if (browser.fullscreenElement) await browser.exitFullscreen?.();
  else if (browser.webkitFullscreenElement) await browser.webkitExitFullscreen?.();
  else await fullscreenRequest()?.();
}

/** @param {string} areaSelector */
function bindGameZoomGuards(areaSelector) {
  /** @param {Event} event */
  const preventZoom = event => {
    const target = /** @type {Element|null} */ (event.target);
    if (target?.closest?.(areaSelector) && !target.closest("input, textarea, select, [contenteditable]")) {
      event.preventDefault();
    }
  };
  document.addEventListener("gesturestart", preventZoom, { passive: false });
  document.addEventListener("dblclick", preventZoom, { passive: false });
  document.addEventListener("touchmove", event => {
    if (event.touches.length > 1) preventZoom(event);
  }, { passive: false });
}

export { bindGameZoomGuards, fullscreenRequest, isDocumentFullscreen, toggleDocumentFullscreen };
