const cachePrefix = `barquitos:${self.registration.scope}:`;
const cacheName = `${cachePrefix}v11`;
const controllerShell = [
  './controller.html',
  './manifest.json',
  './css/controller.css?v=64',
  './js/controller.js',
  './js/gamepad.js',
  './js/controller/joystick.js',
  './js/controller/pwa.js',
  './js/controller/session.js',
  './js/controller/ui.js',
  './js/engine/network_protocol.js',
  './js/engine/config.js',
  './js/cloud_network.js',
  './js/paho-mqtt.min.js',
  './icons/controller-192.png',
  './icons/controller-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    await cache.addAll(controllerShell.map(url => new Request(
      new URL(url, self.registration.scope), { cache: 'reload' }
    )));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(cachePrefix) && key !== cacheName)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith(self.registration.scope)) return;
  if (request.mode !== 'navigate' &&
      !['script', 'style', 'image', 'manifest'].includes(request.destination)) return;
  event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
  let response;
  try {
    response = await fetch(request, { cache: 'no-cache' });
    if (response.ok) {
      const copy = response.clone();
      try {
        const cache = await caches.open(cacheName);
        // Los parámetros de sala no cambian el HTML estático.
        const url = new URL(request.url);
        if (request.mode === 'navigate') url.search = '';
        await cache.put(url.href, copy);
      } catch {
        // Si el almacenamiento está lleno, la respuesta de red sigue siendo válida.
      }
    }
    if (response.status < 500) return response;
  } catch {
    // Solo se usa la copia local si la red falla.
  }
  const cache = await caches.open(cacheName).catch(() => null);
  return await cache?.match(request, { ignoreSearch: request.mode === 'navigate' }) ??
    response ?? Response.error();
}
