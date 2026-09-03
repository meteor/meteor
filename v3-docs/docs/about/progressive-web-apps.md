---
outline:
  level: [2, 3]
---

# Progressive Web Apps

Meteor 3 ships a `--pwa` flag for `meteor create` that scaffolds an installable Blaze app with a vanilla service worker, offline data persistence, and a tour of modern Web APIs out of the box. This guide explains what you get, how it works under the hood, and how to extend it.

If you have not used Meteor before, start with the [Web Apps](/about/web-apps) tutorial first.

## Why a PWA scaffold for Meteor

Several full-stack frameworks ship installable apps by default:

| Framework | PWA support |
|---|---|
| Rails 8 | `rails new` generates a manifest and a service worker |
| Next.js | First-class via the official `next-pwa` integration |
| Blazor (.NET) | `dotnet new blazorwasm --pwa` template |
| Vite-PWA (SvelteKit, Nuxt) | Plugin-based, mature |
| Meteor (before 3.x) | Community packages only (`jam:offline`, `pwa-kit`) |

The `--pwa` scaffold closes that gap with an **opinionated minimal** starting point: every file is meant to be read and edited by the developer, no runtime dependency on a CDN, and no community Atmosphere packages.

## Quick start

```sh
meteor create my-pwa --pwa
cd my-pwa
meteor
```

Open `http://localhost:3000`. The app boots into a two-tab shell:

- **Todos** — a reactive Mongo-backed list demonstrating the standard Meteor data flow.
- **Capabilities** — a tour of five modern Web APIs (network, notifications, share, camera, feature detection) with graceful fallbacks for unsupported browsers.

An orange **Install** banner appears at the top of the page when the browser determines that the app can be installed. Click it (or use the browser's address-bar install icon) to install the PWA. Once installed, the banner becomes a green `Running as an installed PWA` status, and the app opens in a standalone window without the browser's URL bar.

::: tip
PWAs require HTTPS in production. `localhost` is exempted by browser policy, so local development works without certificates. See [HTTPS in production](#https-in-production) for deployment options.
:::

## Scaffold architecture

The `--pwa` skeleton layers four concerns on top of the Blaze toolchain shared with `skel-blaze`:

```
┌────────────────────────────────────────────────────────────┐
│ 1. Installable shell                                       │
│    public/manifest.webmanifest, icons, install banner UI   │
├────────────────────────────────────────────────────────────┤
│ 2. Service worker (vanilla, ~130 lines)                    │
│    public/sw.js — caching strategies, offline fallback     │
├────────────────────────────────────────────────────────────┤
│ 3. Offline data persistence                                │
│    client/offline.js — IDB mirror + persistent method queue│
├────────────────────────────────────────────────────────────┤
│ 4. Web capabilities tour                                   │
│    client/capabilities/*.{html,js} — 5 demo panels         │
└────────────────────────────────────────────────────────────┘
```

The complete file tree:

```
my-pwa/
├── .meteor/
│   ├── packages           Standard Blaze packages (no accounts-*, no extras)
│   └── ...
├── client/
│   ├── main.{html,js,css} Shell, tabs nav, install banner
│   ├── todos.{html,js}    Todos panel (uses offline.js)
│   ├── capabilities.{html,js}     Sub-tabs nav for capabilities
│   ├── capabilities/
│   │   ├── network.{html,js}
│   │   ├── notifications.{html,js}
│   │   ├── share.{html,js}
│   │   ├── camera.{html,js}
│   │   └── detect.{html,js}
│   └── offline.js         IDB mirror + persistent method queue
├── imports/api/
│   └── todos.js           Collection + server-only methods
├── public/
│   ├── manifest.webmanifest
│   ├── sw.js              Vanilla service worker
│   ├── offline.html       Fallback page
│   └── icons/             192, 512, maskable-512 PNG
├── server/
│   └── main.js            Loads imports/api/todos.js
└── package.json
```

Each file is self-contained and editable. The scaffold contains **no community Atmosphere packages**, no runtime CDN dependencies, and no NPM service-worker libraries — just plain Web APIs.

## The service worker

`public/sw.js` is a vanilla `~130-line` service worker. It does not use Workbox or any other library. The reasons:

- **First-install offline works** — a CDN-loaded Workbox fails when the user is offline at first registration; a self-contained SW does not.
- **CSP friendly** — a `script-src 'self'` Content Security Policy blocks an `importScripts('https://...')` call. A self-contained SW works under strict CSP.
- **Readable by a newcomer** — three named strategy helpers (`staleWhileRevalidate`, `cacheFirst`, `networkFirst`) plus a fetch router. Faster to understand than the Workbox plugin API.

### Caching strategies

| Route | Strategy | Notes |
|---|---|---|
| `/manifest.webmanifest`, `/offline.html`, icons | Precache | Available offline from first visit |
| `/__meteor__/*`, `/__rspack__/*`, `*.js`, `*.css` | StaleWhileRevalidate | Bundle URLs are content-hashed, safe to cache |
| Images, fonts | CacheFirst with max-age | 30 days / 90 days respectively |
| Navigation (`request.mode === 'navigate'`) | NetworkFirst (3s timeout) → fallback `/offline.html` | Fresh pages preferred; offline page as last resort |
| `/sockjs/*`, `/websocket` | **NetworkOnly (skip)** | DDP must NEVER be intercepted by the SW |
| Everything else same-origin | Cache match → network | Generic fallback |
| Cross-origin (chrome-extension://, etc.) | Bypass | Prevents Cache.put crashes |

### Why `/` is NOT precached

A common precaching pattern is to add `/` (the application shell) to the precache list so the SW can serve it offline. **This breaks Meteor**: Meteor's [autoupdate](/packages/autoupdate) reloads the page when the loaded bundle hash differs from the server's current hash. A precached `/` returns the stale shell, autoupdate detects the mismatch and triggers another reload, the SW returns the same stale shell — an infinite reload loop.

The scaffold's SW uses `networkFirst` for navigation requests with a 3-second timeout: when online, it returns a fresh shell; when offline, it returns the cached version of the last-visited page; if no cached version exists, it returns the static `/offline.html` page.

### Why `/sockjs/` and `/websocket` are NetworkOnly

DDP (Meteor's reactive data protocol) runs over WebSockets. A service worker intercepting a WebSocket upgrade request breaks the upgrade silently and DDP fails to connect — your app boots without ever receiving published data.

The scaffold's fetch router returns early for these paths:

```js
if (url.pathname.startsWith('/sockjs/') || url.pathname.startsWith('/websocket')) return;
```

The early return means the SW never calls `event.respondWith`, so the browser handles the request natively. This also means the WebSocket upgrade proceeds normally regardless of whether you use SockJS or the raw `/websocket` transport (see [Choosing your WebSocket transport](#choosing-your-websocket-transport)).

### Updating the service worker

The SW uses a `VERSION` constant at the top of the file:

```js
const VERSION = 'v1';
const PRECACHE = `pwa-precache-${VERSION}`;
```

Bumping `VERSION` invalidates all caches: the `activate` handler scans `caches.keys()` and deletes any `pwa-*` cache that does not belong to the current version. After the SW activates, the browser caches the new SW for the next reload; users running the old SW will pick it up on their next navigation.

### Customizing for your own routes

The scaffold's fetch router is a simple if/else chain. To add a strategy for `/api/*` (e.g., a NetworkFirst with a short timeout):

```js
self.addEventListener('fetch', (event) => {
  // ... existing checks (method, origin, DDP skip)

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, RUNTIME.api, 5000));
    return;
  }

  // ... existing routes
});
```

You also need to add `api: 'pwa-api-${VERSION}'` to the `RUNTIME` object and include it in the `KEEP` set so it survives `activate` sweeps.

## Install flow

A PWA becomes installable when the browser determines the app meets [installability criteria](https://web.dev/install-criteria/): valid manifest, registered service worker, served over HTTPS (or localhost), and 192/512 icons.

### The manifest

`public/manifest.webmanifest` is templated with `~name~` substituted to the project name at scaffold time:

```json
{
  "id": "/",
  "name": "my-pwa",
  "short_name": "my-pwa",
  "description": "A Meteor + Blaze Progressive Web App",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "display_override": ["window-controls-overlay", "standalone"],
  "orientation": "portrait",
  "theme_color": "#ff6b35",
  "background_color": "#ffffff",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

Key fields:

- **`id`** anchors the install identity. Changing it later registers a new install on the user's device.
- **`display: standalone`** opens the app without the browser's URL bar after install.
- **`display_override: ["window-controls-overlay", ...]`** opts into modern desktop window controls when supported.

### Maskable icons

Android launchers crop icons into the launcher's preferred shape (circle on Pixel, squircle on Samsung, square on others). A **maskable icon** reserves a 40% safe zone around the central artwork so the crop never clips the brand mark. The scaffold ships a `icon-maskable-512.png` with the orange logo centered inside the safe zone.

The non-maskable 192 and 512 icons are used everywhere else (browser tabs, install dialog previews, splash screens).

### The install banner

The `installPanel` Blaze template in `client/main.html` shows an orange Install banner when:

1. The browser has fired the `beforeinstallprompt` event (Chromium-based browsers).
2. The app is not already installed.
3. The user has not dismissed the banner in the last 7 days.

`client/main.js` captures the event and stores it in a `ReactiveVar`:

```js
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPromptEvent.set(e);
});
```

Calling `e.prompt()` later (on click) shows the native install dialog. The user's choice (`accepted` or `dismissed`) is captured via `e.userChoice`. Dismissal sets a `pwa-install-dismissed-at` timestamp in `localStorage` for a 7-day cooldown.

### Detecting an installed app

When the app is launched from its home-screen icon (standalone mode), `client/main.js` detects it via five `matchMedia` queries:

```js
const isInstalled = new ReactiveVar(
  window.matchMedia('(display-mode: standalone)').matches ||
  window.matchMedia('(display-mode: minimal-ui)').matches ||
  window.matchMedia('(display-mode: fullscreen)').matches ||
  window.matchMedia('(display-mode: window-controls-overlay)').matches ||
  window.navigator.standalone === true
);
```

Different browsers and OSes report standalone state differently. The last clause (`navigator.standalone`) is iOS Safari's non-standard but widely-used signal.

When `isInstalled` is true, the install banner is replaced by a green status pill:

```
Running as an installed PWA.
```

The `appinstalled` event fires after the user confirms the install dialog; the scaffold listens for it to flip `isInstalled` to `true` and clear any dismissal timestamp.

## Offline data persistence

The service worker handles offline navigation (the app shell, the bundle, the offline fallback page). But it does NOT handle offline data: DDP runs over WebSockets, and a service worker cannot intercept WebSocket traffic. Without additional work, refreshing the installed PWA in airplane mode shows an empty Todos list.

The scaffold's `client/offline.js` adds a user-land data layer that solves this:

```
┌────────────────────────────────────────────────────────────┐
│ Server (MongoDB)                                            │
└────────────────────────────────────────────────────────────┘
                            │
                            ▼ DDP publication (WebSocket)
┌────────────────────────────────────────────────────────────┐
│ Mongo.Collection 'Todos'   ← server-backed, populated by pub│
└────────────────────────────────────────────────────────────┘
                  │                                  ▲
       observe ──┴─────► IDB store 'todos-cache'    │
                                  ▲                  │
                                  │                  │
                            mirror.observe           │ findMerged()
                                  │                  │ (UI helper)
                                  ▼                  │
┌────────────────────────────────────────────────────────────┐
│ Mongo.Collection(null) mirror ← local-only, hydrated from   │
│                                  IDB at boot                │
└────────────────────────────────────────────────────────────┘
```

### Two collections, merged in the UI

The naive approach — calling `Todos._collection.insert(doc)` to populate the server-backed collection from IDB — does not work. When the publication later delivers the same `_id`, DDP's merge box errors with `Server sent add for existing id`.

The scaffold uses **two collections**:

- The server-backed `Todos` collection, populated only by the publication.
- A local-only `Mongo.Collection(null)` mirror, populated by IDB hydration and by offline writes.

The UI merges both via `findMerged()`, deduplicating by `_id` with the server winning. When the server publishes a doc that was previously in the mirror (e.g., after an offline write is replayed), the mirror entry is silently removed.

### syncCollection() walkthrough

`syncCollection(coll, storeName)` wires up the full data flow:

```js
export async function syncCollection(coll, storeName) {
  const mirror = offlineMirror(storeName);
  await openDb();

  // 1. Hydrate the mirror from IDB at boot.
  const cached = await idbGetAll(storeName);
  cached.forEach((doc) => {
    if (!mirror.findOne(doc._id) && !coll.findOne(doc._id)) {
      mirror.insert(doc);
    }
  });

  // 2. Observe the server-backed coll: persist to IDB, dedupe mirror.
  coll.find().observe({
    added(doc) {
      idbPut(storeName, doc);
      if (mirror.findOne(doc._id)) mirror.remove(doc._id);
    },
    changed(doc) { idbPut(storeName, doc); },
    removed(doc) { idbDelete(storeName, doc._id); },
  });

  // 3. Observe the mirror: persist offline writes to IDB too.
  mirror.find().observe({
    added(doc) { idbPut(storeName, doc); },
    changed(doc) { idbPut(storeName, doc); },
    // removed: handled by the coll observer (server caught up).
  });
}
```

### The persistent method queue

`callPersistent(name, ...args)` is the offline-aware replacement for `Meteor.callAsync`:

```js
export async function callPersistent(name, ...args) {
  if (Meteor.status().connected) {
    return Meteor.callAsync(name, ...args);
  }
  await enqueue(name, args);
}
```

When DDP is disconnected, the call is appended to an IDB store with a timestamp. A `Tracker.autorun` watches `Meteor.status().connected` and drains the queue on reconnect:

```js
let wasConnected = false;
Tracker.autorun(() => {
  const connected = Meteor.status().connected;
  if (connected && !wasConnected) drainQueue();
  wasConnected = connected;
});
```

The drain replays queued calls in `queuedAt` order, removing each from the queue after a successful `Meteor.callAsync` response.

### Idempotent server methods

Replaying a queued call must not produce duplicates. The scaffold's `todos.insert` method accepts a client-generated `_id` and catches the duplicate-key error:

```js
async 'todos.insert'(_id, text) {
  try {
    return await Todos.insertAsync({ _id, text, done: false, createdAt: new Date() });
  } catch (e) {
    if (e.code === 11000 || /duplicate key/i.test(String(e.message || e))) {
      return _id; // idempotent replay
    }
    throw e;
  }
}
```

### Why methods are server-only

`Meteor.methods({...})` is wrapped in `if (Meteor.isServer)` in the scaffold. The reason is subtle: if the method is defined on both sides (the default), Meteor runs a **client-side stub** during `Meteor.callAsync` that simulates the method and inserts into the local collection. Combined with the mirror's optimistic insert, this **double-inserts** into the server-backed `Todos` collection and trips the merge-box error when the publication delivers the authoritative doc.

By moving the method definition into `if (Meteor.isServer)`, the client never runs a stub, the mirror is the only source of optimistic UI, and the publication's `added` message reaches an empty `Todos._id` cleanly.

::: warning
The trade-off: `Meteor.callAsync` for toggle / remove operations does not update the UI until the server round-trip completes (no client-side stub). On localhost this is imperceptible; on a slow mobile network you may see a brief delay. If sub-100ms latency matters for your UI, see [Extending the scaffold](#extending-the-scaffold) for the alternative pattern.
:::

### Four scenarios

**Online insert:**
1. `mirror.insert(doc)` — UI shows the doc immediately.
2. `callPersistent('todos.insert', _id, text)` — DDP is connected, so it forwards directly to `Meteor.callAsync`.
3. Server inserts → publication delivers `added` → `coll.find().observe` fires → IDB updated, mirror entry removed.
4. Final state: one entry in `Todos`, IDB has the latest server doc, mirror is empty.

**Offline insert:**
1. `mirror.insert(doc)` — UI shows the doc immediately.
2. `callPersistent(...)` — DDP disconnected, the call is appended to `__method_queue` in IDB.
3. `mirror.find().observe.added` fires → IDB updated with the offline doc.
4. Final state (while offline): one entry in mirror, IDB has the offline doc, queue has the pending call.

**Refresh while offline:**
1. App boots, `syncCollection` runs.
2. IDB store has the offline doc → it's inserted into the mirror.
3. UI hydrates with the mirror's content → the user sees their todos again.
4. `__method_queue` still has the pending call.

**Reconnect:**
1. `Meteor.status().connected` flips to `true`.
2. The Tracker autorun fires `drainQueue()`.
3. Each queued call replays via `Meteor.callAsync`.
4. Server inserts → publication delivers → `coll.find().observe.added` fires → mirror entry removed, IDB updated.
5. Final state: server is now authoritative, mirror is empty.

## Web capabilities tour

The Capabilities tab is a sub-tabbed showcase of five modern Web APIs. Each panel demonstrates the same feature-detection + graceful-fallback pattern that any production PWA should follow.

### The pattern

Each capability follows three steps:

1. **Detect** at module load: `const supported = ...`.
2. **Branch in the template** between the supported UI and a grayed-out disabled state with a caniuse link.
3. **Handle permissions and errors** explicitly when applicable.

### Five included panels

| Panel | API | Notes |
|---|---|---|
| **Network** | `navigator.onLine` + `navigator.connection` | Reactive on `online`/`offline` events; live downlink and RTT when available |
| **Notifications** | `Notification` + `ServiceWorker.showNotification` | Three permission states with explicit UX for `denied` |
| **Share** | `navigator.share` | Distinguishes user cancel (`AbortError`) from other failures |
| **Camera** | `navigator.mediaDevices.getUserMedia` + `<canvas>` | State machine (idle / live / snapshot); critical `onDestroyed` releases tracks |
| **Detect** | feature detection for 16 APIs | Static table with caniuse links for each |

### The Camera panel's `onDestroyed`

The conditional template instantiation pattern (`{{#if isSubTab 'camera'}}{{> cameraPanel}}{{/if}}`) is non-negotiable for the Camera sub-panel. When the user switches sub-tabs, the template instance is destroyed and `Template.cameraPanel.onDestroyed` fires:

```js
Template.cameraPanel.onDestroyed(function () {
  if (this.stream) {
    this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
});
```

Without this, the webcam LED stays on after the user leaves the tab — a privacy and UX failure. Using CSS `display: none` to "hide" the panel does not work because the template instance is not destroyed.

### Adding your own panel

To add, say, a **clipboard** panel:

1. Create `client/capabilities/clipboard.{html,js}`:

   ```html
   <!-- clipboard.html -->
   <template name="clipboardPanel">
     <h3>Clipboard</h3>
     {{#if supported}}
       <input type="text" name="text" value="Copy me" autocomplete="off">
       <button type="button" data-action="copy" class="cap-btn">Copy</button>
       <button type="button" data-action="paste" class="cap-btn">Paste</button>
       {{#if status}}<p class="cap-status">{{status}}</p>{{/if}}
     {{else}}
       <button type="button" class="cap-disabled" disabled>Copy</button>
       <p class="cap-unsupported-note">Clipboard API unavailable.</p>
     {{/if}}
   </template>
   ```

   ```js
   // clipboard.js
   import { Template } from 'meteor/templating';
   import { ReactiveVar } from 'meteor/reactive-var';
   import './clipboard.html';

   const supported = !!(navigator.clipboard && 'writeText' in navigator.clipboard);
   const status = new ReactiveVar('');

   Template.clipboardPanel.helpers({
     supported() { return supported; },
     status() { return status.get(); },
   });

   Template.clipboardPanel.events({
     async 'click [data-action="copy"]'(event, instance) {
       const text = instance.find('input').value;
       try { await navigator.clipboard.writeText(text); status.set('Copied.'); }
       catch (e) { status.set(`Failed: ${e.message}`); }
     },
     async 'click [data-action="paste"]'(event, instance) {
       try {
         const text = await navigator.clipboard.readText();
         instance.find('input').value = text;
         status.set('Pasted.');
       } catch (e) { status.set(`Failed: ${e.message}`); }
     },
   });
   ```

2. In `client/capabilities.html`, add a sub-tab button and a conditional template slot:

   ```html
   <button class="subtab {{subTabClass 'clipboard'}}" data-subtab="clipboard">Clipboard</button>
   ...
   {{#if isSubTab 'clipboard'}}{{> clipboardPanel}}{{/if}}
   ```

3. In `client/capabilities.js`, add the import:

   ```js
   import './capabilities/clipboard.js';
   ```

That's the full extension pattern. No additional plumbing required.

## Choosing your WebSocket transport

::: warning Common misconception
A Meteor app does not run SockJS and uWebSockets at the same time. It uses **one** transport, period. This is true whether or not the app is a PWA — making your app installable changes nothing about the transport choice.
:::

### One pluggable choice

Since Meteor 3.5 ([PR #14231](https://github.com/meteor/meteor/pull/14231)), the WebSocket transport is a single pluggable choice exposed by `ddp-server`. Two implementations ship in the box:

| Transport | Server library | Endpoint hit by the client | Client uses |
|---|---|---|---|
| **`sockjs`** (default) | `sockjs` npm package on top of Node http | `/sockjs/info`, `/sockjs/xhr_streaming`, etc. | SockJS browser library (tries WebSocket, falls back to xhr-streaming, jsonp-polling for restrictive networks) |
| **`uws`** | [uWebSockets.js](https://github.com/uNetworking/uWebSockets.js) C++ binding | `/websocket` | Native browser WebSocket — no SockJS, no preflight |

Picking the transport selects the server library **and** the client endpoint together. You cannot mix-and-match server with client; one choice covers both.

### How to enable

```js
// settings.json
{
  "packages": {
    "ddp-server": {
      "transport": "uws"
    }
  }
}
```

```sh
# Or as an environment variable
DDP_TRANSPORT=uws meteor run

# Or via the legacy compat flag (resolves to "uws")
DISABLE_SOCKJS=1 meteor run
```

Resolution priority (from `packages/ddp-server/transports/index.js`):

1. `Meteor.settings.packages['ddp-server'].transport`
2. `DDP_TRANSPORT` environment variable
3. `DISABLE_SOCKJS=1` → `uws` (backward compatibility with [PR #14206](https://github.com/meteor/meteor/pull/14206))
4. Default: `sockjs`

The default is `sockjs` for backward compatibility with apps deployed behind proxies that block raw WebSocket upgrades.

### When to pick which

- **`sockjs`** — historical default. Keep it when you serve users behind corporate proxies, legacy firewalls, or any network that blocks WebSocket. SockJS automatically falls back to xhr-streaming or jsonp-polling. The trade-off: a `/sockjs/info` preflight XHR adds 100–300 ms on every connection.
- **`uws`** — when you control the network and want maximum throughput. Micro-benchmarks in [PR #14231](https://github.com/meteor/meteor/pull/14231) show ~14 k calls/s on `uws` vs ~8 k on `sockjs`, and a smaller client bundle (no SockJS library shipped on `/websocket` transport).

If you run multi-tenant containers, multi-process scaling, or several Meteor apps sharing a Linux network namespace under `uws`, see [PR #14425](https://github.com/meteor/meteor/pull/14425) and set an explicit `uws.port` per process in `Meteor.settings` to avoid kernel-level port collision via `SO_REUSEPORT`.

### Why the service worker whitelists both paths

The scaffold's `public/sw.js` contains:

```js
if (url.pathname.startsWith('/sockjs/') || url.pathname.startsWith('/websocket')) return;
```

The `||` is **defensive, not additive**. A given app only ever hits one of the two endpoints — `/sockjs/*` if `DDP_TRANSPORT=sockjs`, `/websocket` if `DDP_TRANSPORT=uws`. The scaffold can't predict which transport you'll pick, so it bypasses both. The benefit: switching between transports later (or shipping the scaffold to an app that uses `uws`) does not require touching the service worker.

If you've already committed to one transport, you can simplify the check to a single path — but there is no functional reason to do so.

### Where the scaffold relies on transport

Nowhere. Everything in `client/offline.js`, `client/todos.js`, and the capability panels uses only `Meteor.status()`, `Meteor.callAsync`, and `Mongo.Collection` — all of which sit above the transport layer. Whichever transport you choose, the rest of the scaffold behaves identically.

## HTTPS in production

PWAs require HTTPS to install. Specifically:

- A service worker can only register on an **HTTPS origin** (or `localhost`/`127.0.0.1`).
- `navigator.share`, `getUserMedia`, `Notification`, push, and most other modern Web APIs require a [secure context](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts).
- `beforeinstallprompt` does not fire on HTTP origins.

### Local development

`localhost` and `127.0.0.1` are exempted by browser policy: everything works over plain HTTP. This includes the service worker, `Notification.requestPermission`, and the install banner.

### Mobile testing

Testing on a real phone over `http://192.168.x.x:3000` fails because it is neither localhost nor HTTPS. Use a tunnel that exposes localhost as HTTPS:

```sh
# Cloudflare Tunnel (no account required for short tests)
cloudflared tunnel --url http://localhost:3000

# Or ngrok
ngrok http 3000
```

Both produce a `https://<random>.<provider>.app` URL you open on the phone. The install banner appears, the SW registers, and the full PWA flow works.

### Production deployment

Common deployment paths:

| Host | HTTPS handling |
|---|---|
| Galaxy | Automatic HTTPS for `.meteorapp.com` subdomains; custom domains via the Galaxy panel |
| Behind nginx / Caddy / Traefik | Let's Encrypt with auto-renewal; reverse-proxy `wss://` upgrade headers correctly |
| Cloudflare in front | Free SSL termination; enable `Always Use HTTPS` and WebSocket support |

The service worker registration in `client/main.js` is scoped to `/`:

```js
navigator.serviceWorker.register('/sw.js', { scope: '/' });
```

If you serve the app under a sub-path (e.g., `/app/`), adjust the scope and the manifest `start_url` / `scope` accordingly.

## Limitations and known gaps

### iOS Safari

iOS Safari is the most constrained PWA environment:

- **No `beforeinstallprompt` event** — users install via the Share menu → Add to Home Screen. The scaffold's install banner only appears on Chromium browsers; iOS users see no in-app prompt.
- **No Background Sync API** — the persistent method queue still works (it drains on the next visit when the app is foregrounded), but background drains do not happen on iOS.
- **No Periodic Background Sync, no Web Push (until iOS 16.4 for installed PWAs).**
- **No File System Access, no Contact Picker, no Web Bluetooth, no WebUSB.**

For production apps targeting iOS, plan around these gaps explicitly. The scaffold's Detect panel will show ❌ for the missing APIs so end users see what works.

### Android device quirks

Some Android OEMs override Web API behavior at the OS level:

- **Xiaomi (HyperOS / MIUI)** suppresses `navigator.vibrate()` regardless of app or OS settings. `navigator.vibrate(...)` returns `true` and silently does nothing.
- **Some launchers** crop maskable icons aggressively. Test the maskable variant on the target device before shipping.
- **Battery savers** can suspend the service worker and disable push notifications.

### DDP method queue across reloads

The scaffold's `callPersistent` queue handles offline writes that survive page reloads — but only when the user is **already disconnected** at the time of the call. If a method call is in flight (sent to the server but no response received) when the user reloads the page, the call is lost. The upstream PR adding `ddp-client._persistentMethodQueueHook` will close this gap. Until then, the queue covers the most common cases.

## Extending the scaffold

### Caching additional collections

Apply the same `syncCollection` pattern to any Mongo.Collection you want available offline:

```js
import { Notes } from '../imports/api/notes.js';
import { syncCollection } from './offline.js';

syncCollection(Notes, 'notes-cache');
```

In the helper, use `findMerged(Notes, 'notes-cache', selector, options)` instead of `Notes.find(selector, options).fetch()`.

### Using a community offline package

If your needs outgrow the inline IDB pattern, you can replace `client/offline.js` with the community [`jam:offline`](/community-packages/offline) package, which handles per-collection retention rules, cross-tab sync, and automatic reconciliation. The scaffold's pattern was deliberately chosen to be minimal and inline; for production apps with many collections, complex sync rules, or conflict resolution, the mature package is a reasonable upgrade path.

### Customizing the install banner

The install banner is a simple Blaze template (`installPanel` in `client/main.html`). Reposition it, restyle it, or wrap it in a modal — it is just HTML and CSS.

The 7-day dismissal cooldown lives in `client/main.js` as `DISMISS_COOLDOWN_MS`. Change it freely.

### Custom service worker strategies

Add new strategies to `public/sw.js` by writing additional helpers and registering them in the fetch router. The three included helpers (`staleWhileRevalidate`, `cacheFirst`, `networkFirst`) cover most needs; for more exotic strategies (e.g., a Range-request-aware cache for video), write your own and follow the same pattern.

## Comparison with Cordova

Meteor has long supported native mobile apps via [Cordova](/about/cordova). PWAs and Cordova are complementary, not interchangeable. Choose based on the features you actually need.

### Decision matrix

| Capability | PWA | Cordova |
|---|---|---|
| Installable from a browser | ✅ | ❌ |
| Distributed via app store | Limited | ✅ |
| Push notifications (Android) | ✅ | ✅ |
| Push notifications (iOS) | Limited (iOS 16.4+, installed only) | ✅ |
| Camera, microphone, location | ✅ (with permission) | ✅ |
| Bluetooth, USB, NFC | ✅ on Chromium-based, ❌ on iOS Safari | ✅ |
| Background tasks | Limited (Background Sync) | ✅ |
| App store presence | ❌ | ✅ |
| Build time | Instant (just `meteor`) | Slow (native toolchain) |
| Update flow | Automatic (next visit) | Requires app store review |

### Cordova plugins replaceable by Web APIs

For apps that mostly use the browser-side capabilities, many Cordova plugins have direct Web API equivalents:

| Cordova plugin | Web API |
|---|---|
| `cordova-plugin-camera` | `getUserMedia` |
| `cordova-plugin-qrscanner` | `BarcodeDetector` (Chromium) |
| `cordova-plugin-geolocation` | `navigator.geolocation` |
| `cordova-plugin-device-motion` | `DeviceMotionEvent` |
| `cordova-plugin-device-orientation` | `DeviceOrientationEvent` |
| `cordova-plugin-vibration` | `navigator.vibrate` |
| `cordova-plugin-keepscreen-on` | `navigator.wakeLock` |
| `cordova-plugin-battery-status` | `navigator.getBattery` |
| `cordova-plugin-network-information` | `navigator.connection` |
| `cordova-plugin-screen-orientation` | `screen.orientation` |
| `cordova-plugin-share` | `navigator.share` |
| `cordova-plugin-tts` | `SpeechSynthesisUtterance` |
| `cordova-plugin-speechrecognition` | `SpeechRecognition` (browser-specific) |
| `cordova-plugin-clipboard` | `navigator.clipboard` |

### When you still need Cordova

PWAs cannot do **everything** Cordova can. Common cases for keeping Cordova:

- You need to publish on the Apple App Store or Google Play Store as a brand presence.
- You need iOS push notifications without the iOS 16.4+ installed-PWA constraint.
- You need a feature gated behind a native plugin: Apple Pay, deep biometric integration, MDM enrollment, etc.
- You need the app to work fully offline on iOS Safari (Background Sync is missing).

In all other cases, a PWA built on the `--pwa` scaffold reaches more users with less build pipeline overhead.

## Where to next

- [Cordova guide](/about/cordova) — the native counterpart, for cases where a PWA is not enough.
- [Environment variables](/cli/environment-variables) — for `DISABLE_SOCKJS` and other transport switches.
- [Build tool](/about/build-tool) — for the Rspack-based bundle used by the scaffold.
- [Web Apps](/about/web-apps) — the general getting-started tutorial.
