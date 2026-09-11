// Bumped -pwa-1 -> -pwa-2: index.html, calc.js y styles.css cambiaron juntos
// como conjunto (IVA/margen bidireccional, Fase 1). La estrategia
// cache-first-con-actualizacion-en-segundo-plano serviria una mezcla de
// app-shell antiguo y nuevo en la primera carga offline si no se invalida
// el cache previo explicitamente.
const CACHE_VERSION = 'core-c12-v2-pwa-2';
const APP_SHELL_CACHE = CACHE_VERSION + '-app-shell';

const APP_SHELL_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/calc.js',
  '/manifest.webmanifest',
  '/icons/core-c12-icon.svg',
  '/icons/core-c12-maskable.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then(cache => cache.addAll(APP_SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(cacheNames => Promise.all(
        cacheNames
          .filter(cacheName => cacheName.startsWith('core-c12-') && cacheName !== APP_SHELL_CACHE)
          .map(cacheName => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(cacheFirstWithBackgroundUpdate(request, '/index.html'));
    return;
  }

  event.respondWith(cacheFirstWithBackgroundUpdate(request));
});

async function cacheFirstWithBackgroundUpdate(request, fallbackUrl) {
  const cache = await caches.open(APP_SHELL_CACHE);
  const cachedResponse = await cache.match(request);
  const fallbackResponse = fallbackUrl ? await cache.match(fallbackUrl) : null;

  const networkUpdate = fetch(request)
    .then(response => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cachedResponse) {
    return cachedResponse;
  }

  if (fallbackResponse) {
    return fallbackResponse;
  }

  const networkResponse = await networkUpdate;
  return networkResponse || new Response('', {
    status: 503,
    statusText: 'Service Unavailable'
  });
}
