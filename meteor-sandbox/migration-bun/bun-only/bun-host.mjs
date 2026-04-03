#!/usr/bin/env bun
// bun-host.mjs — Single-port Bun host for Meteor ESM bundles
//
// Architecture (Phase 1 — transitional compatibility seams):
//
//   Bun.serve(:PORT)
//     ├── HTTP → fetch() over Unix socket → Express (webapp's httpServer)
//     └── WS  → BunSocket adapter → StreamServer
//
// ⚠️ TRANSITIONAL: The Unix socket proxy and WebApp.startListening patch
// are Phase 1 compatibility seams. Target architecture is a direct
// Bun.serve() fetch handler with no Express and no proxy.
//
// Usage:
//   MONGO_URL=mongodb://localhost:27017/myapp \
//   ROOT_URL=http://localhost:3000 \
//   PORT=3000 \
//     bun bun-host.mjs /path/to/bundle/programs/server

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// BunSocket is co-located with this file
import { BunSocket } from './bun-ddp-transport.mjs';

// esm-loader is resolved from the bundle's serverDir (set after arg parsing)
let bootPackages, runMain;

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const bundlePath = process.argv[2];
if (!bundlePath) {
  console.error('Usage: bun bun-host.mjs <path-to-bundle/programs/server>');
  process.exit(1);
}

const serverDir = path.resolve(bundlePath);
const PORT = parseInt(process.env.PORT || '3000');
const SOCK_PATH = `/tmp/meteor-bun-${process.pid}.sock`;

console.log(`[bun-host] Booting Meteor on Bun from ${serverDir}`);

// ---------------------------------------------------------------------------
// Step 1: Load esm-loader from the bundle, then boot packages
// ---------------------------------------------------------------------------

const loaderPath = path.join(serverDir, 'esm-loader.mjs');
({ bootPackages, runMain } = await import(loaderPath));

await bootPackages(serverDir);

// ---------------------------------------------------------------------------
// Step 2: Patch WebApp.startListening (⚠️ TRANSITIONAL SEAM)
//
// Instead of letting webapp bind httpServer to a TCP port, we bind it
// to a Unix socket. Bun.serve() listens on the real PORT and proxies
// HTTP requests to Express via the Unix socket.
//
// This seam exists because rewriting webapp's 1500-line Express stack
// as a Bun.serve() fetch handler is Phase 2+ work. The Unix socket
// proxy lets us validate everything else first.
// ---------------------------------------------------------------------------

const WebApp = Package.webapp.WebApp;

// ---------------------------------------------------------------------------
// Step 2b: Build static file map from client program manifests
//
// Serves static assets (JS, CSS, fonts, images) directly via Bun.file()
// (zero-copy sendfile) instead of proxying through Express.
// Boilerplate HTML and dynamic routes still go through the proxy.
// ---------------------------------------------------------------------------

const staticFiles = new Map(); // pathname → { absPath, hash, type, cacheable }
const bundleDir = path.dirname(serverDir); // programs/
const programsDir = bundleDir;

for (const arch of ['web.browser', 'web.browser.legacy']) {
  const programPath = path.join(programsDir, arch, 'program.json');
  if (!fs.existsSync(programPath)) continue;

  const program = JSON.parse(fs.readFileSync(programPath, 'utf8'));
  const archDir = path.join(programsDir, arch);

  for (const item of (program.manifest || [])) {
    if (!item.url || !item.path) continue;
    // Strip query string from URL for matching
    const urlPath = item.url.split('?')[0];
    if (staticFiles.has(urlPath)) continue; // prefer web.browser over legacy

    staticFiles.set(urlPath, {
      absPath: path.join(archDir, item.path),
      hash: item.hash || null,
      type: item.type || 'asset',
      cacheable: !!item.hash, // hashed files are immutable
    });
  }
}

console.log(`[bun-host] Static file map: ${staticFiles.size} entries`);

const CONTENT_TYPES = {
  js: 'application/javascript; charset=UTF-8',
  css: 'text/css; charset=UTF-8',
  json: 'application/json; charset=UTF-8',
  html: 'text/html; charset=UTF-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  eot: 'application/vnd.ms-fontobject',
  ico: 'image/x-icon',
};

function contentTypeFor(filePath, type) {
  if (type === 'js') return CONTENT_TYPES.js;
  if (type === 'css') return CONTENT_TYPES.css;
  if (type === 'json') return CONTENT_TYPES.json;
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return CONTENT_TYPES[ext] || 'application/octet-stream';
}

function serveStaticFile(urlPath) {
  const info = staticFiles.get(urlPath);
  if (!info) return null;

  const headers = {
    'Content-Type': contentTypeFor(info.absPath, info.type),
  };

  if (info.cacheable && info.hash) {
    headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    headers['ETag'] = `"${info.hash}"`;
  } else {
    headers['Cache-Control'] = 'public, max-age=0';
  }

  return new Response(Bun.file(info.absPath), { headers });
}

// ---------------------------------------------------------------------------
// Step 2c: Direct boilerplate HTML serving
//
// Serves the Meteor HTML shell directly using WebApp's boilerplate generator.
// Uses Meteor's own APIs (categorizeRequest, getBoilerplate) — not a
// reimplementation. Just calls them from a Bun fetch handler instead of
// Express middleware.
// ---------------------------------------------------------------------------

const WebAppInternals = Package.webapp.WebAppInternals;
const RoutePolicy = Package.routepolicy?.RoutePolicy;

function isAppUrl(urlPath) {
  if (urlPath === '/favicon.ico' || urlPath === '/robots.txt') return false;
  if (urlPath === '/app.manifest') return false;
  if (RoutePolicy && RoutePolicy.classify(urlPath)) return false;
  return true;
}

async function serveBoilerplate(req, url) {
  const pathname = url.pathname;

  // Only serve boilerplate for "app URLs" — not assets, not API routes
  if (!isAppUrl(pathname)) return null;

  // Only GET/HEAD
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('', {
      status: req.method === 'OPTIONS' ? 200 : 405,
      headers: { 'Allow': 'OPTIONS, GET, HEAD' },
    });
  }

  // Build a request-like object for WebApp.categorizeRequest
  const headers = Object.fromEntries(req.headers.entries());
  const meteorReq = {
    url: url.pathname + url.search,
    headers,
    cookies: {},
  };

  const request = WebApp.categorizeRequest(meteorReq);

  // Handle missing CSS/JS resource requests (Meteor cache busting)
  const query = Object.fromEntries(url.searchParams);
  if (query.meteor_css_resource) {
    return new Response('.meteor-css-not-found-error { width: 0px;}', {
      status: 200,
      headers: { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-cache' },
    });
  }
  if (query.meteor_js_resource || query.meteor_dont_serve_index) {
    return new Response('404 Not Found', {
      status: 404,
      headers: { 'Cache-Control': 'no-cache' },
    });
  }

  // Check arch exists
  if (!WebApp.clientPrograms[request.arch]) {
    return new Response('404 Not Found', { status: 404, headers: { 'Cache-Control': 'no-cache' } });
  }

  // Wait if client program is paused (hot code push)
  await WebApp.clientPrograms[request.arch].paused;

  try {
    const { stream, statusCode, headers: extraHeaders } = await WebAppInternals.getBoilerplate(request, request.arch);

    // Consume Node stream to string
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const html = Buffer.concat(chunks).toString('utf8');

    const responseHeaders = {
      'Content-Type': 'text/html; charset=utf-8',
      ...extraHeaders,
    };

    return new Response(html, {
      status: statusCode || 200,
      headers: responseHeaders,
    });
  } catch (e) {
    console.error(`[bun-host] Boilerplate error: ${e.stack || e.message}`);
    return new Response('Internal Server Error', { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Step 2d: Patch WebApp.startListening
// ---------------------------------------------------------------------------

WebApp.startListening = function(httpServer, listenOptions, cb) {
  // Clean up any pre-existing socket file
  try { fs.unlinkSync(SOCK_PATH); } catch (e) {}

  httpServer.listen({ path: SOCK_PATH }, () => {
    console.log(`[bun-host] Express/webapp listening on Unix socket ${SOCK_PATH}`);

    // Start Bun.serve() on the real port
    const bunServer = Bun.serve({
      port: PORT,
      hostname: process.env.BIND_IP || '0.0.0.0',
      idleTimeout: 120, // seconds, matches Meteor's LONG_SOCKET_TIMEOUT

      async fetch(req, server) {
        // --- WebSocket upgrade ---
        if (req.headers.get('upgrade')?.toLowerCase() === 'websocket') {
          const url = new URL(req.url, `http://localhost:${PORT}`);
          const wsPath = url.pathname;
          // Accept:
          //   /websocket (direct)
          //   /sockjs/.../websocket (SockJS client sends /sockjs/{server}/{session}/websocket)
          if (wsPath === '/websocket' || (wsPath.includes('/sockjs/') && wsPath.endsWith('/websocket'))) {
            const ok = server.upgrade(req, { data: { req } });
            return ok ? undefined : new Response('WebSocket upgrade failed', { status: 400 });
          }
        }

        // --- Static files via Bun.file() (zero-copy) ---
        const url = new URL(req.url, `http://localhost:${PORT}`);
        const staticResponse = serveStaticFile(url.pathname);
        if (staticResponse) return staticResponse;

        // --- Boilerplate HTML served directly (no Express) ---
        const boilerplateResponse = await serveBoilerplate(req, url);
        if (boilerplateResponse) return boilerplateResponse;

        // --- Everything else → proxy to Express via Unix socket ---
        // Remaining routes: WebApp.connectHandlers user middleware,
        // Meteor internal handlers (dynamic-import, oauth, etc.)
        try {
          return await fetch(
            new Request(`http://localhost${url.pathname}${url.search}`, {
              method: req.method,
              headers: req.headers,
              body: (req.method !== 'GET' && req.method !== 'HEAD') ? req.body : undefined,
              redirect: 'manual',
            }),
            { unix: SOCK_PATH }
          );
        } catch (e) {
          console.error(`[bun-host] Proxy error: ${e.message}`);
          return new Response('Internal proxy error', { status: 502 });
        }
      },

      // --- WebSocket handler for DDP ---
      websocket: {
        open(ws) {
          const socket = new BunSocket(ws, ws.data.req);
          ws.data.socket = socket;

          const streamServer = Package.meteor.Meteor.server.stream_server;

          // Use _onConnection if available (PR #14231 pluggable transport API).
          // Fall back to direct registration for bundles built before that PR.
          if (typeof streamServer._onConnection === 'function') {
            streamServer._onConnection(socket);
          } else {
            socket.setWebsocketTimeout(45 * 1000);
            socket.on('close', () => {
              streamServer.open_sockets = streamServer.open_sockets.filter(s => s !== socket);
            });
            streamServer.open_sockets.push(socket);
            streamServer.registration_callbacks.forEach(cb => cb(socket));
          }
        },

        message(ws, msg) {
          const data = typeof msg === 'string' ? msg : new TextDecoder().decode(msg);
          ws.data.socket.emit('data', data);
        },

        close(ws) {
          if (ws.data.socket) {
            ws.data.socket.emit('close');
          }
        },
      },
    });

    console.log(`[bun-host] Bun.serve() on port ${PORT}`);
    console.log(`[bun-host] HTTP: http://localhost:${PORT}/`);
    console.log(`[bun-host] WS:   ws://localhost:${PORT}/websocket`);

    // Signal to webapp that we're listening
    cb();
  });

  // --- Socket lifecycle cleanup ---
  const cleanup = () => {
    try { fs.unlinkSync(SOCK_PATH); } catch (e) {}
  };
  process.on('SIGTERM', () => { cleanup(); process.exit(0); });
  process.on('SIGINT', () => { cleanup(); process.exit(0); });
  process.on('exit', cleanup);
};

// ---------------------------------------------------------------------------
// Step 3: Run main — webapp will call our patched startListening
// ---------------------------------------------------------------------------

await runMain();
