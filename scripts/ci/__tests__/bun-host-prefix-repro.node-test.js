// scripts/ci/__tests__/bun-host-prefix-repro.test.js
// Minimal standalone reproducer and verification for bun-host under a ROOT_URL_PATH_PREFIX (e.g. /ks).
// Runs under both Node (node:test) and Bun (bun test).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

function findExecutable(name) {
  if (name === 'bun' && process.versions?.bun) {
    return process.execPath;
  }
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    const candidate = path.join(dir, name);
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {}
  }
  return null;
}

test('bun-host prefix routing: WebSocket upgrade and static files under ROOT_URL_PATH_PREFIX', async (t) => {
  const bunPath = findExecutable('bun');
  if (!bunPath) {
    t.skip('Bun binary not found in PATH');
    return;
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-bun-prefix-test-'));
  const sockPath = path.join(dir, 'test-express.sock');
  const staticFile = path.join(dir, 'app.js');
  fs.writeFileSync(staticFile, 'console.log("static-client-file-under-prefix");');

  // Allocate an ephemeral port for Bun.serve
  const srv = http.createServer();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const testPort = srv.address().port;
  await new Promise((r) => srv.close(r));

  // 1. Mock Express/Connect server on Unix socket
  const expressServer = http.createServer((req, res) => {
    // If request has prefix /ks, strip it as WebApp does
    let url = req.url;
    if (url.startsWith('/ks')) {
      url = url.slice(3) || '/';
    }

    if (url.startsWith('/api/echo')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ echo: true, url: req.url }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!DOCTYPE html><html><body>Boilerplate under /ks</body></html>');
  });

  await new Promise((resolve) => expressServer.listen(sockPath, resolve));

  // 2. Bun host process with ROOT_URL_PATH_PREFIX='/ks'
  const hostScript = path.join(dir, 'test-host-prefix.mjs');
  fs.writeFileSync(
    hostScript,
    `
const staticFiles = new Map([
  ['/app.js', { absPath: ${JSON.stringify(staticFile)}, hash: 'h123' }],
]);

function getPathPrefix() {
  if (process.env.ROOT_URL) {
    try {
      let p = new URL(process.env.ROOT_URL).pathname;
      if (p.endsWith('/')) p = p.slice(0, -1);
      return p;
    } catch (e) {}
  }
  return '';
}

function isWebSocketPath(pathname) {
  const prefix = getPathPrefix();
  let p = pathname;
  if (prefix && (p === prefix || p.startsWith(prefix + '/'))) {
    p = p.slice(prefix.length) || '/';
  }
  return p === '/websocket' || p === '/websocket/' ||
    (p.includes('/sockjs/') && p.endsWith('/websocket'));
}

function serveStaticFile(urlPath) {
  let info = staticFiles.get(urlPath);
  if (!info) {
    const prefix = getPathPrefix();
    if (prefix && (urlPath === prefix || urlPath.startsWith(prefix + '/'))) {
      const subPath = urlPath.slice(prefix.length) || '/';
      info = staticFiles.get(subPath);
    }
  }
  if (!info) return null;

  return new Response(Bun.file(info.absPath), {
    headers: {
      'Content-Type': 'application/javascript; charset=UTF-8',
      'ETag': '"' + info.hash + '"',
    },
  });
}

const server = Bun.serve({
  port: ${testPort},
  hostname: '127.0.0.1',
  async fetch(req, srv) {
    if (req.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      const url = new URL(req.url);
      if (isWebSocketPath(url.pathname)) {
        return srv.upgrade(req) ? undefined : new Response('WS upgrade failed', { status: 400 });
      }
    }

    const url = new URL(req.url);
    const staticResp = serveStaticFile(url.pathname);
    if (staticResp) return staticResp;

    try {
      return await fetch(
        new Request('http://localhost' + url.pathname + url.search, {
          method: req.method,
          headers: req.headers,
          body: (req.method !== 'GET' && req.method !== 'HEAD') ? req.body : undefined,
          redirect: 'manual',
        }),
        { unix: ${JSON.stringify(sockPath)} }
      );
    } catch (err) {
      return new Response('Proxy Error: ' + err.message, { status: 502 });
    }
  },
  websocket: {
    open(ws) { ws.send('ddp-connected-prefix'); },
    message(ws, msg) { ws.send(msg); },
  },
});

console.log('BUN_PREFIX_READY');
`
  );

  const hostChild = spawn(bunPath, [hostScript], {
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, ROOT_URL: `http://localhost:${testPort}/ks` },
  });

  t.after(async () => {
    hostChild.kill('SIGKILL');
    await new Promise((r) => expressServer.close(r));
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('bun host failed to start')), 5000);
    hostChild.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('BUN_PREFIX_READY')) {
        clearTimeout(timer);
        resolve();
      }
    });
  });

  const baseUrl = `http://127.0.0.1:${testPort}`;

  // 1. Prefixed WebSocket upgrade at ws://localhost:<port>/ks/websocket
  const ws = new WebSocket(`ws://127.0.0.1:${testPort}/ks/websocket`);
  const wsMsg = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Prefixed WS timeout')), 3000);
    ws.addEventListener('message', (event) => {
      clearTimeout(timer);
      resolve(String(event.data));
    });
    ws.addEventListener('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
  ws.close();
  assert.equal(wsMsg, 'ddp-connected-prefix');

  // 2. Prefixed SockJS WebSocket upgrade at ws://localhost:<port>/ks/sockjs/123/xyz/websocket
  const wsSockjs = new WebSocket(`ws://127.0.0.1:${testPort}/ks/sockjs/123/xyz/websocket`);
  const wsSockjsMsg = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('SockJS WS timeout')), 3000);
    wsSockjs.addEventListener('message', (event) => {
      clearTimeout(timer);
      resolve(String(event.data));
    });
    wsSockjs.addEventListener('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
  wsSockjs.close();
  assert.equal(wsSockjsMsg, 'ddp-connected-prefix');

  // 3. Fallback unprefixed WebSocket upgrade at ws://localhost:<port>/websocket
  const wsDirect = new WebSocket(`ws://127.0.0.1:${testPort}/websocket`);
  const wsDirectMsg = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Direct WS timeout')), 3000);
    wsDirect.addEventListener('message', (event) => {
      clearTimeout(timer);
      resolve(String(event.data));
    });
    wsDirect.addEventListener('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
  wsDirect.close();
  assert.equal(wsDirectMsg, 'ddp-connected-prefix');

  // 4. Prefixed static file serving at /ks/app.js
  const staticRes = await fetch(`${baseUrl}/ks/app.js`);
  assert.equal(staticRes.status, 200);
  assert.equal(await staticRes.text(), 'console.log("static-client-file-under-prefix");');

  // 5. Prefixed API proxying to Express at /ks/api/echo
  const apiRes = await fetch(`${baseUrl}/ks/api/echo`);
  assert.equal(apiRes.status, 200);
  const json = await apiRes.json();
  assert.equal(json.echo, true);
  assert.equal(json.url, '/ks/api/echo');
});
