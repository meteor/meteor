// Workbox-loaded service worker for Meteor PWA scaffold.
// importScripts pulls Workbox at install time (no build step required).

importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.1.0/workbox-sw.js');

if (!self.workbox) {
  console.error('[SW] Workbox failed to load from CDN; bypassing.');
} else {
  workbox.setConfig({ debug: false });
  workbox.core.setCacheNameDetails({ prefix: 'pwa', suffix: 'v1' });
  workbox.core.skipWaiting();
  workbox.core.clientsClaim();

  const { precaching } = workbox;
  const { registerRoute, setCatchHandler, NavigationRoute } = workbox.routing;
  const {
    CacheFirst,
    StaleWhileRevalidate,
    NetworkFirst,
    NetworkOnly,
  } = workbox.strategies;
  const { ExpirationPlugin } = workbox.expiration;
  const { CacheableResponsePlugin } = workbox.cacheableResponse;

  // ===== App shell precache =====
  // NB: `/` is intentionally NOT precached. Meteor's autoupdate compares the
  // loaded bundle hash with the server's; if a stale precached `/` is served,
  // autoupdate force-reloads, the SW serves the same shell, → infinite loop.
  precaching.precacheAndRoute([
    { url: '/manifest.webmanifest', revision: 'manifest-1' },
    { url: '/offline.html', revision: 'offline-1' },
    { url: '/icons/icon-192.png', revision: 'icon-1' },
    { url: '/icons/icon-512.png', revision: 'icon-1' },
    { url: '/icons/icon-maskable-512.png', revision: 'icon-1' },
  ]);

  // Same-origin guard: chrome-extension:// and other schemes break Cache.put.
  const sameOriginMatch = (predicate) => ({ url, sameOrigin }) =>
    sameOrigin && predicate(url);

  // Meteor / Rspack bundle — content-hashed → safe StaleWhileRevalidate.
  registerRoute(
    sameOriginMatch((url) =>
      url.pathname.startsWith('/__meteor__/') ||
      url.pathname.startsWith('/__rspack__/') ||
      url.pathname.endsWith('.js') ||
      url.pathname.endsWith('.css')
    ),
    new StaleWhileRevalidate({
      cacheName: 'pwa-bundle',
      plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })],
    })
  );

  // Images.
  registerRoute(
    ({ request, sameOrigin }) => sameOrigin && request.destination === 'image',
    new CacheFirst({
      cacheName: 'pwa-images',
      plugins: [
        new CacheableResponsePlugin({ statuses: [0, 200] }),
        new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 }),
      ],
    })
  );

  // Fonts.
  registerRoute(
    ({ request, sameOrigin }) => sameOrigin && request.destination === 'font',
    new CacheFirst({
      cacheName: 'pwa-fonts',
      plugins: [
        new CacheableResponsePlugin({ statuses: [0, 200] }),
        new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 90 * 24 * 60 * 60 }),
      ],
    })
  );

  // App-defined HTTP API endpoints — placeholder for /api/*.
  registerRoute(
    sameOriginMatch((url) => url.pathname.startsWith('/api/')),
    new NetworkFirst({
      cacheName: 'pwa-api',
      networkTimeoutSeconds: 5,
      plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })],
    }),
    'GET'
  );

  // DDP / sockjs : NEVER cache. The SW must let WebSocket upgrades pass.
  registerRoute(
    sameOriginMatch((url) =>
      url.pathname.startsWith('/sockjs/') || url.pathname.startsWith('/websocket')
    ),
    new NetworkOnly()
  );

  // Navigation: NetworkFirst with offline fallback.
  const navStrategy = new NetworkFirst({
    cacheName: 'pwa-pages',
    networkTimeoutSeconds: 3,
    plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })],
  });
  registerRoute(new NavigationRoute(async (params) => {
    try {
      return await navStrategy.handle(params);
    } catch {
      const cache = await caches.open(workbox.core.cacheNames.precache);
      const cached = await cache.match(precaching.getCacheKeyForURL('/offline.html'));
      return cached || Response.error();
    }
  }));

  setCatchHandler(async ({ request }) => {
    if (request.destination === 'document') {
      const cache = await caches.open(workbox.core.cacheNames.precache);
      const cached = await cache.match(precaching.getCacheKeyForURL('/offline.html'));
      return cached || Response.error();
    }
    return Response.error();
  });

  // setCacheNameDetails creates a new cache bucket on every suffix bump but
  // never deletes the previous ones. Sweep on every activate.
  const KEEP_CACHES = new Set([
    workbox.core.cacheNames.precache,
    workbox.core.cacheNames.runtime,
    workbox.core.cacheNames.googleAnalytics,
    'pwa-bundle',
    'pwa-images',
    'pwa-fonts',
    'pwa-api',
    'pwa-pages',
  ]);
  self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((name) => name.startsWith('pwa') && !KEEP_CACHES.has(name))
          .map((name) => caches.delete(name))
      );
    })());
  });
}
