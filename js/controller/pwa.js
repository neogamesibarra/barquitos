/** @type {WakeLockSentinel|null} */
let wakeLock = null;
let wakeLockActive = false;
let pageActive = true;
let requestingWakeLock = false;

async function syncWakeLock() {
  if (!wakeLockActive || !pageActive || document.hidden) {
    const current = wakeLock;
    wakeLock = null;
    if (current) await current.release().catch(() => {});
    return;
  }
  if (wakeLock || requestingWakeLock || !window.navigator?.wakeLock) return;

  requestingWakeLock = true;
  try {
    const acquired = await window.navigator.wakeLock.request('screen');
    if (!wakeLockActive || !pageActive || document.hidden) {
      await acquired.release();
      return;
    }
    wakeLock = acquired;
    acquired.addEventListener('release', () => {
      if (wakeLock === acquired) wakeLock = null;
    }, { once: true });
  } catch {
    // El navegador puede rechazar la solicitud por energía, permisos o visibilidad.
  } finally {
    requestingWakeLock = false;
  }
}

/** @param {boolean} active */
function setWakeLockActive(active) {
  wakeLockActive = active;
  void syncWakeLock();
}

function initPWA() {
  window.addEventListener('pagehide', () => {
    pageActive = false;
    void syncWakeLock();
  });
  window.addEventListener('pageshow', () => {
    pageActive = true;
    void syncWakeLock();
  });
  window.addEventListener('appinstalled', () => window.dispatchEvent(new Event('resize')));
  const { protocol, hostname } = window.location;
  const local = protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
  if (protocol !== 'https:' && !local) return;
  window.navigator.serviceWorker?.register(new URL('../../sw.js', import.meta.url)).catch(error => {
    console.warn('No se pudo activar el modo instalable del mando:', error);
  });
}


export { initPWA, setWakeLockActive, syncWakeLock };
