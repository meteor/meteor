#!/usr/bin/env bun
// bun-host.mjs — Single-port Bun host for Meteor ESM bundles
//
//   Bun.serve(:PORT)
//     ├── Static files → Bun.file() (zero-copy)
//     ├── API/middleware/SSR/boilerplate → fetch() over Unix socket → Express
//     └── WebSocket DDP → StreamServer._onConnection()
//
// Usage:
//   MONGO_URL=mongodb://localhost:27017/myapp \
//   ROOT_URL=http://localhost:3000 \
//   PORT=3000 \
//     bun bun-host.mjs /path/to/bundle/programs/server

import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { EventEmitter } from 'events';

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const serverDir = path.resolve(process.argv[2] || '');
if (!serverDir || !fs.existsSync(path.join(serverDir, 'program.json'))) {
  console.error('Usage: bun bun-host.mjs <path-to-bundle/programs/server>');
  process.exit(1);
}

const PORT = parseInt(process.env.PORT || '3000');
const SOCK_PATH = `/tmp/meteor-bun-${process.pid}.sock`;

console.log(`[bun-host] Booting Meteor on Bun from ${serverDir}`);

// ---------------------------------------------------------------------------
// Step 1: Boot packages via ESM loader
// ---------------------------------------------------------------------------

const loaderPath = pathToFileURL(path.join(serverDir, 'esm-loader.mjs')).href;
const { bootPackages, runMain } = await import(loaderPath);
await bootPackages(serverDir);

const WebApp = Package.webapp.WebApp;

// ---------------------------------------------------------------------------
// Step 2: Build static file map from client manifests
// ---------------------------------------------------------------------------

const staticFiles = new Map();
const programsDir = path.dirname(serverDir);

for (const arch of ['web.browser', 'web.browser.legacy']) {
  const programPath = path.join(programsDir, arch, 'program.json');
  if (!fs.existsSync(programPath)) continue;

  const program = JSON.parse(fs.readFileSync(programPath, 'utf8'));
  const archDir = path.join(programsDir, arch);

  for (const item of (program.manifest || [])) {
    if (!item.url || !item.path) continue;
    const urlPath = item.url.split('?')[0];
    if (staticFiles.has(urlPath)) continue;

    staticFiles.set(urlPath, {
      absPath: path.join(archDir, item.path),
      hash: item.hash || null,
      type: item.type || 'asset',
      cacheable: !!item.hash,
    });
  }
}

console.log(`[bun-host] Static file map: ${staticFiles.size} entries`);

const CONTENT_TYPES = {
  js: 'application/javascript; charset=UTF-8',
  css: 'text/css; charset=UTF-8',
  json: 'application/json; charset=UTF-8',
  html: 'text/html; charset=UTF-8',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg',
  gif: 'image/gif', ico: 'image/x-icon',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf',
  eot: 'application/vnd.ms-fontobject',
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

  const headers = { 'Content-Type': contentTypeFor(info.absPath, info.type) };
  if (info.cacheable && info.hash) {
    headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    headers['ETag'] = `"${info.hash}"`;
  } else {
    headers['Cache-Control'] = 'public, max-age=0';
  }
  return new Response(Bun.file(info.absPath), { headers });
}

// ---------------------------------------------------------------------------
// Step 3: BunSocket adapter for DDP WebSocket
// ---------------------------------------------------------------------------

class BunSocket extends EventEmitter {
  constructor(ws, req) {
    super();
    this._ws = ws;
    this.protocol = 'websocket-raw';
    this.headers = req?.headers ? Object.fromEntries(new Headers(req.headers).entries()) : {};
    this.remoteAddress = req?.headers?.get?.('x-forwarded-for') || '127.0.0.1';
    this.url = req?.url || '/websocket';
    this._session = { recv: { connection: { setTimeout() {} }, protocol: 'websocket-raw' } };
  }
  send(data) { try { this._ws.send(data); } catch (e) {} }
  write(data) { this.send(data); }
  close() { try { this._ws.close(); } catch (e) {} }
  setWebsocketTimeout() {}
}

// ---------------------------------------------------------------------------
// Step 4: Patch WebApp.startListening → Bun.serve()
// ---------------------------------------------------------------------------

WebApp.startListening = function (httpServer, listenOptions, cb) {
  try { fs.unlinkSync(SOCK_PATH); } catch (e) {}

  httpServer.listen({ path: SOCK_PATH }, () => {
    console.log(`[bun-host] Express/webapp on Unix socket ${SOCK_PATH}`);

    Bun.serve({
      port: PORT,
      hostname: process.env.BIND_IP || '0.0.0.0',
      idleTimeout: 120,

      async fetch(req, server) {
        if (req.headers.get('upgrade')?.toLowerCase() === 'websocket') {
          const url = new URL(req.url, `http://localhost:${PORT}`);
          const p = url.pathname;
          if (p === '/websocket' || p === '/websocket/' ||
              (p.includes('/sockjs/') && p.endsWith('/websocket'))) {
            return server.upgrade(req, { data: { req } })
              ? undefined
              : new Response('WebSocket upgrade failed', { status: 400 });
          }
        }

        const url = new URL(req.url, `http://localhost:${PORT}`);
        const staticResp = serveStaticFile(url.pathname);
        if (staticResp) return staticResp;

        try {
          return await fetch(
            new Request(`http://localhost${url.pathname}${url.search}`, {
              method: req.method, headers: req.headers,
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

      websocket: {
        open(ws) {
          const socket = new BunSocket(ws, ws.data.req);
          ws.data.socket = socket;
          const streamServer = Package.meteor.Meteor.server.stream_server;
          streamServer._onConnection(socket);
        },
        message(ws, msg) {
          const data = typeof msg === 'string' ? msg : new TextDecoder().decode(msg);
          ws.data.socket.emit('data', data);
        },
        close(ws) {
          if (ws.data.socket) ws.data.socket.emit('close');
        },
      },
    });

    console.log(`[bun-host] Bun.serve() on port ${PORT}`);
    console.log(`[bun-host] http://localhost:${PORT}/`);
    cb();
  });

  const cleanup = () => { try { fs.unlinkSync(SOCK_PATH); } catch (e) {} };
  process.on('SIGTERM', () => { cleanup(); process.exit(0); });
  process.on('SIGINT', () => { cleanup(); process.exit(0); });
  process.on('exit', cleanup);
};

// ---------------------------------------------------------------------------
// Step 5: Run main — webapp calls our patched startListening
// ---------------------------------------------------------------------------

await runMain();
