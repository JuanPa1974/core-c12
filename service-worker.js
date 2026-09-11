// Bumped -pwa-2 -> -pwa-3: nuevo config.js entra en el app shell (Fase 2A,
// configuracion persistente de tasas/margenes/decimales) e index.html ahora
// lo referencia antes de calc.js. Sin este bump, una PWA ya instalada podria
// servir calc.js nuevo con config.js ausente desde el cache previo.
const CACHE_VERSION = 'core-c12-v2-pwa-3';
const APP_SHELL_CACHE = CACHE_VERSION + '-app-shell';

const APP_SHELL_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/config.js',
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
