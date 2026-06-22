// Service worker for the Meteor PWA scaffold — no external dependencies.
// Scope: caches the app shell and static assets for installability + offline
// page loads. It intentionally does NOT handle offline *data* (collection
// mirroring, queued Methods, sync on reconnect) — that belongs to a separate
// offline-data layer, out of scope for this baseline scaffold.
// Edit the strategies below to match your app's caching needs. Bump VERSION
// to force a fresh cache generation; old `pwa-*` buckets are swept in `activate`.

const VERSION = 'v1';
const PRECACHE = `pwa-precache-${VERSION}`;
const RUNTIME = {
  bundle: `pwa-bundle-${VERSION}`,
  images: `pwa-images-${VERSION}`,
  fonts:  `pwa-fonts-${VERSION}`,
  pages:  `pwa-pages-${VERSION}`,
};
const KEEP = new Set([PRECACHE, ...Object.values(RUNTIME)]);

// Dev mode: the SW is registered as `/sw.js?dev=1`. In dev it stays installable
// but NEVER caches the app bundle, so Meteor's autoupdate always sees a fresh
// bundle and there is no reload loop. Only the static precache is served from
// cache. Production (`/sw.js`) uses the full offline caching strategy below.
const DEV = new URL(self.location.href).searchParams.get('dev') === '1';

// `/` is intentionally NOT precached: Meteor's autoupdate force-reloads when
// the loaded bundle hash differs from the server's; a stale precached shell
// would loop forever. Navigation is handled via networkFirst below.
const PRECACHE_URLS = [
  '/manifest.webmanifest',
  '/offline.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(PRECACHE).then((c) => c.addAll(PRECACHE_URLS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith('pwa-') && !KEEP.has(k))
          .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// ===== Strategies =====

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fresh = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => cached || Response.error());
  return cached || fresh;
}

async function cacheFirst(req, cacheName, maxAgeSeconds) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) {
    const dateHeader = cached.headers.get('date');
    const age = dateHeader
      ? (Date.now() - new Date(dateHeader).getTime()) / 1000
      : Infinity;
    if (!maxAgeSeconds || age < maxAgeSeconds) return cached;
  }
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    if (cached) return cached; // stale, but better than a broken asset offline
    throw err;
  }
}

async function networkFirst(req, cacheName, timeoutMs = 3000) {
  const cache = await caches.open(cacheName);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(req, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    clearTimeout(timer);
    const cached = await cache.match(req);
    if (cached) return cached;
    const offline = await (await caches.open(PRECACHE)).match('/offline.html');
    return offline || Response.error();
  }
}

// ===== Fetch router =====

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Bypass cross-origin (chrome-extension://, third-party CDNs, etc.).
  if (url.origin !== self.location.origin) return;

  // DDP must never be intercepted — WebSocket upgrades break otherwise.
  if (url.pathname.startsWith('/sockjs/') || url.pathname.startsWith('/websocket')) return;

  // Dev: installable but no dynamic caching — serve precached static (manifest,
  // icons, offline.html) from the PRECACHE bucket ONLY, send everything else
  // fresh to the network. Matching only PRECACHE (not `caches.match`, which
  // spans every bucket) means a stale bundle/page left by a prior prod build
  // can never be served in dev — no flash of a previous app on reload.
  if (DEV) {
    event.respondWith(
      caches.open(PRECACHE).then((c) => c.match(request)).then((hit) => hit || fetch(request))
    );
    return;
  }

  // Navigation: fresh-first, offline.html fallback.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, RUNTIME.pages));
    return;
  }

  // Meteor / Rspack bundle — content-hashed URLs → stale-while-revalidate is safe.
  if (
    url.pathname.startsWith('/__meteor__/') ||
    url.pathname.startsWith('/__rspack__/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css')
  ) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME.bundle));
    return;
  }

  if (request.destination === 'image') {
    event.respondWith(cacheFirst(request, RUNTIME.images, 30 * 24 * 60 * 60));
    return;
  }

  if (request.destination === 'font') {
    event.respondWith(cacheFirst(request, RUNTIME.fonts, 90 * 24 * 60 * 60));
    return;
  }

  // Precache hits (manifest, icons, offline.html) + anything else same-origin.
  event.respondWith(caches.match(request).then((c) => c || fetch(request)));
});
