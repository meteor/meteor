---
outline:
  level: [2, 3]
---

# Progressive Web Apps

`meteor create --pwa` scaffolds a Blaze app that browsers recognize as an installable Progressive Web App: a web app manifest, icons, a dependency-free service worker and an offline fallback page, on top of the standard Blaze skeleton. This guide covers what the skeleton contains, how the service worker behaves in development and in production, how installation works, and how to take the app further.

The skeleton is an installability baseline. It caches the app shell and static assets so the installed app opens without a network. It does not keep Meteor data on the device and does not replay writes made while offline. See [Offline data](#offline-data) for the options.

## Quick start

```sh
meteor create my-app --pwa
cd my-app
meteor
```

Open `http://localhost:3000`. `localhost` is a secure context, so everything below works without HTTPS during development:

- The page links `manifest.webmanifest` and registers the service worker from `Meteor.startup`.
- Chromium-based browsers show an install icon in the address bar and fire `beforeinstallprompt`, which the skeleton turns into an **Install app** button under the heading.
- In DevTools, **Application → Manifest** lists the app without errors and **Application → Service workers** shows the worker as activated. Lighthouse's installability audit passes.

A phone or any other device needs HTTPS before the browser offers installation. See [Testing on a phone](#testing-on-a-phone).

## What the skeleton adds

The `--pwa` skeleton is the Blaze skeleton (`meteor create --blaze`) plus a thin PWA layer:

| File | Role |
|---|---|
| `public/manifest.webmanifest` | Web app manifest: name and short name templated from the app name, `display: standalone`, theme and background colors, icons |
| `public/icons/` | `icon-192.png`, `icon-512.png` and `icon-maskable-512.png` |
| `public/sw.js` | The service worker: precache, caching strategies, offline fallback |
| `public/offline.html` | The page served for a navigation the worker cannot satisfy offline |
| `client/main.html` | The manifest link, theme color and Apple touch icon in `<head>`, plus the `installPrompt` template |
| `client/main.js` | The install prompt logic and the service worker registration |
| `client/main.css` | The install button style |

Meteor packages and npm dependencies are the same as in the Blaze skeleton: the PWA layer adds nothing from Atmosphere or npm. The [`meteor create` reference](/cli/#meteorcreate) lists them.

## The service worker

`public/sw.js` is plain JavaScript with no library and no build step. It is meant to be read and edited: three strategy helpers (`networkFirst`, `staleWhileRevalidate`, `cacheFirst`) and a `fetch` handler that routes each request to one of them.

### Development and production

The registration in `client/main.js` picks the worker URL from `Meteor.isProduction`:

```js
const swUrl = `${prefix}/sw.js${Meteor.isProduction ? '' : '?dev=1'}`;
navigator.serviceWorker.register(swUrl, { scope: `${prefix}/` });
```

In development (`/sw.js?dev=1`) the worker precaches its static files and serves only those from the cache: the manifest, the icons and `offline.html`. Everything else goes to the network, the app bundle and navigations included. The app stays installable, and hot code push never meets a stale bundle, so there is no reload loop.

In production (`/sw.js`) the worker applies the strategies below.

### Strategies in production

| Request | Strategy |
|---|---|
| `manifest.webmanifest`, `offline.html`, the icons | Precached when the worker installs, served from the cache |
| Navigations | Network first with a 3-second timeout, then the cached copy of that page, then `offline.html` |
| `__meteor__/`, `__rspack__/`, `.js` and `.css` files | Stale-while-revalidate: the cached file is served and refreshed in the background. Bundle URLs are content-hashed, so a cached file is never wrong |
| Images | Cache first, kept 30 days |
| Fonts | Cache first, kept 90 days |
| Anything else on the same origin | The precache, then the network |

Three kinds of requests never go through the worker: non-GET requests, cross-origin requests (third-party CDNs, browser extension URLs) and DDP traffic under `/sockjs/` and `/websocket`, which the browser handles directly so the connection and its fallbacks are never served from a cache.

The final fallback consults the precache only. A page stored by a navigation is never handed to a data request for the same URL, which a cache-wide lookup would do.

### Why the app shell is not precached

Hot code push compares the hash of the loaded bundle with the server's and reloads the page when they differ. A precached `/` would serve the same stale page after every reload, and the app would loop. The worker therefore serves navigations network first, keeps the last response of each page for offline use, and falls back to `offline.html` only for a page that was never loaded. The hashed bundle files are safe to cache because a new build has new URLs.

### Updating the worker

`VERSION` at the top of `sw.js` names the cache buckets. Bump it when you change the strategies or the precache list: the new worker installs, calls `skipWaiting()` and `clients.claim()`, and its `activate` handler deletes every `pwa-*` bucket of a previous version. Users get the new worker on their next visit.

A new build of the app needs no bump: its bundle has new URLs and hot code push reloads the page as usual. Files of previous builds stay in the bundle bucket until the next `VERSION` bump, so bump it from time to time if the bucket grows.

### Adding a route

Each strategy takes a request and a bucket name. To cache a directory of static JSON for a day, add a bucket to `RUNTIME` (the `activate` sweep keeps every bucket listed there) and a branch in the `fetch` handler, before the bundle check:

```js
const RUNTIME = {
  // ...existing buckets
  data: `pwa-data-${VERSION}`,
};

if (url.pathname.startsWith(`${BASE}data/`)) {
  event.respondWith(cacheFirst(request, RUNTIME.data, 24 * 60 * 60));
  return;
}
```

`BASE` is the worker's own directory, so the branch also works under a path-prefixed `ROOT_URL`.

## Installation

### The manifest

```json
{
  "name": "my-app",
  "short_name": "my-app",
  "description": "A Meteor + Blaze Progressive Web App",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "theme_color": "#ff6b35",
  "background_color": "#ffffff",
  "lang": "en",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

`name` and `short_name` are filled with the app name at creation. Edit the description and the colors, and keep `theme_color` in sync with the `theme-color` meta tag in `client/main.html` and in `offline.html`. `start_url`, `scope` and the icon paths are relative to the manifest, which is what lets a path-prefixed deployment work without changes.

Browsers identify an installed app by its `start_url` unless the manifest carries an `id`. Add one before the first release if `start_url` may change later.

### Icons

Android launchers crop icons into their own shape. The maskable icon keeps its artwork inside the central safe zone so the crop never clips it; the two `any` icons are used everywhere else, including the install dialog and the splash screen. Replace the three placeholders with your own at the same sizes and keep the `purpose` values. `client/main.html` also links `icon-192.png` as the Apple touch icon.

### The install button

Chromium-based browsers fire `beforeinstallprompt` once the app meets the installability criteria. `client/main.js` stores the event in a `ReactiveVar`, the `installPrompt` template shows the button while an event is available, and a click calls `event.prompt()`. The `appinstalled` event hides the button again.

Safari and Firefox do not fire the event. They offer installation from their own menus (Add to Home Screen on iOS, Add to Dock on macOS), and the button never appears there. The app itself can tell it runs installed with `window.matchMedia('(display-mode: standalone)').matches`.

## Path-prefixed ROOT_URL

A `ROOT_URL` with a path, such as `https://example.com/app`, works without configuration. `client/main.js` prefixes the manifest and icon links and registers `/app/sw.js` with the `/app/` scope; inside the worker, the precache paths and the DDP check are relative to the worker's own URL.

## HTTPS

Service workers and installation require a secure context: HTTPS, or `localhost` during development. Galaxy serves apps over HTTPS, custom domains included. Behind your own reverse proxy, terminate TLS there and forward WebSocket upgrades so DDP keeps working.

### Testing on a phone

A phone cannot reach `localhost`, and `http://192.168.x.x:3000` is not a secure context. Expose the development server through a tunnel instead:

```sh
meteor
# in another terminal
ngrok http 3000
# or
cloudflared tunnel --url http://localhost:3000
```

Open the `https://` URL the tunnel prints on the phone, then use the browser's install option. The tunnel forwards the app only, not the hot module replacement port, so a development overlay about hot reload may show up; dismiss it, the app runs.

### Testing the offline shell

Stop the Meteor server, then reload the installed app: the page comes out of the worker's cache. The DevTools **Offline** checkbox is not enough on its own, because an open DDP WebSocket stays open; call `Meteor.disconnect()` in the console to test the disconnected state of your UI, and `Meteor.reconnect()` to come back.

## Offline data

The worker caches files, not Meteor data. Opened without a network, the installed app shows its pages and runs its code, but Minimongo stays empty until the connection is back, and Methods called meanwhile wait in memory for the reconnection and are lost if the page reloads. Two options exist today:

- The community package [`jam:offline`](/community-packages/offline) keeps Minimongo data in IndexedDB, queues Methods while offline and replays them on reconnect.
- The `notes-offline` example (`meteor create my-app --example notes-offline`) is a complete offline-first app built with React, the `jam:*` packages and a Workbox-generated service worker.

## Workbox instead of the hand-written worker

The skeleton's worker is deliberately dependency-free. If you prefer a generated worker with a revisioned precache and cache expiration, Rspack runs `workbox-webpack-plugin` as part of the build: see the [Service Worker section](/about/modern-build-stack/rspack-bundler-integration#service-worker) of the Rspack guide and the `notes-offline` example. Replace `public/sw.js` with the generated worker and adjust the registration in `client/main.js`; the manifest, the icons and the install button stay as they are.

## Limitations

- **iOS**: Safari does not fire `beforeinstallprompt`; users install from the Share menu. An app added to the home screen runs in its own container with its own storage and cookies, so the user signs in again after installing.
- **Push notifications and background sync** are not part of the skeleton. Both are standard service worker APIs that you can add to `sw.js`.

## Cordova or PWA?

A PWA ships with `meteor` alone, updates on the next visit and reaches every browser that supports service workers. Choose [Cordova](/about/cordova) when the app has to be distributed through the app stores or needs a native plugin the web platform does not cover.
