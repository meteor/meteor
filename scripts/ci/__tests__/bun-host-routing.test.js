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

test('bun-host HTTP routing: static files, dynamic API pass-through, and body forwarding', async (t) => {
  const bunPath = findExecutable('bun');
  if (!bunPath) {
    t.skip('Bun binary not found in PATH');
    return;
  }

  // Create temporary directory for fixture
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-bun-host-test-'));
  const sockPath = path.join(dir, 'test-express.sock');
  const staticFile = path.join(dir, 'app.js');
  fs.writeFileSync(staticFile, 'console.log("static-client-file");');

  // Allocate an ephemeral port for Bun.serve (avoid port 3000 collision!)
  // We find an unused port first
  const srv = http.createServer();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const testPort = srv.address().port;
  await new Promise((r) => srv.close(r));

  // 1. Create the mock Express/Connect server on Unix socket
  const expressServer = http.createServer((req, res) => {
    if (req.url.startsWith('/api/echo')) {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            echo: true,
            method: req.method,
            url: req.url,
            body: body ? JSON.parse(body) : null,
          })
        );
      });
      return;
    }

    // Default fallback: Express boilerplate HTML simulation
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!DOCTYPE html><html><body>Meteor Boilerplate</body></html>');
  });

  await new Promise((resolve) => expressServer.listen(sockPath, resolve));

  // 2. Spawn Bun process running Bun.serve mirroring bun-host.mjs routing
  const hostScript = path.join(dir, 'test-host.mjs');
  fs.writeFileSync(
    hostScript,
    `
const staticFiles = new Map([
  ['/app.js', { absPath: ${JSON.stringify(staticFile)}, hash: 'h123' }],
]);

const pathPrefix = '/ks';

function isWebSocketPath(pathname) {
  let p = pathname;
  if (pathPrefix && (p === pathPrefix || p.startsWith(pathPrefix + '/'))) {
    p = p.slice(pathPrefix.length) || '/';
  }
  return p === '/websocket' || p === '/websocket/' ||
    (p.includes('/sockjs/') && p.endsWith('/websocket'));
}

function getStaticFile(urlPath) {
  let info = staticFiles.get(urlPath);
  if (!info && pathPrefix && (urlPath === pathPrefix || urlPath.startsWith(pathPrefix + '/'))) {
    info = staticFiles.get(urlPath.slice(pathPrefix.length) || '/');
  }
  return info;
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
    const staticInfo = getStaticFile(url.pathname);
    if (staticInfo) {
      return new Response(Bun.file(staticInfo.absPath), {
        headers: {
          'Content-Type': 'application/javascript; charset=UTF-8',
          'ETag': '"' + staticInfo.hash + '"',
        },
      });
    }

    // Dynamic HTTP proxy over Unix socket to Express
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
    open(ws) { ws.send('ddp-connected'); },
    message(ws, msg) { ws.send(msg); },
  },
});

console.log('BUN_HOST_READY');
`
  );

  const hostChild = spawn(bunPath, [hostScript], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  t.after(async () => {
    hostChild.kill('SIGKILL');
    await new Promise((r) => expressServer.close(r));
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  // Wait for BUN_HOST_READY
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('bun host failed to start')), 5000);
    hostChild.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('BUN_HOST_READY')) {
        clearTimeout(timer);
        resolve();
      }
    });
  });

  const baseUrl = `http://127.0.0.1:${testPort}`;

  // Scenario 1: Static file is served with correct headers and zero-copy content
  const staticRes = await fetch(`${baseUrl}/app.js`);
  assert.equal(staticRes.status, 200);
  assert.ok(staticRes.headers.get('content-type').includes('javascript'));
  assert.equal(staticRes.headers.get('etag'), '"h123"');
  assert.equal(await staticRes.text(), 'console.log("static-client-file");');

  // Scenario 2: Dynamic GET API is NOT shadowed by boilerplate HTML
  const getApiRes = await fetch(`${baseUrl}/api/echo?query=true`);
  assert.equal(getApiRes.status, 200);
  assert.ok(getApiRes.headers.get('content-type').includes('application/json'));
  const getJson = await getApiRes.json();
  assert.equal(getJson.echo, true);
  assert.equal(getJson.method, 'GET');
  assert.equal(getJson.url, '/api/echo?query=true');

  // Scenario 3: Dynamic POST API forwards body cleanly to Express (not 405 Method Not Allowed)
  const postApiRes = await fetch(`${baseUrl}/api/echo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item: 'banana', count: 3 }),
  });
  assert.equal(postApiRes.status, 200);
  assert.ok(postApiRes.headers.get('content-type').includes('application/json'));
  const postJson = await postApiRes.json();
  assert.equal(postJson.echo, true);
  assert.equal(postJson.method, 'POST');
  assert.deepEqual(postJson.body, { item: 'banana', count: 3 });

  // Scenario 4: Non-API app URLs fall through to Express and receive the Meteor boilerplate
  const pageRes = await fetch(`${baseUrl}/some-app-page`);
  assert.equal(pageRes.status, 200);
  assert.ok(pageRes.headers.get('content-type').includes('text/html'));
  assert.ok((await pageRes.text()).includes('Meteor Boilerplate'));

  // Scenario 5: WebSocket upgrade on /websocket (unprefixed)
  const ws = new WebSocket(`ws://127.0.0.1:${testPort}/websocket`);
  const wsMsg = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WS timeout')), 3000);
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
  assert.equal(wsMsg, 'ddp-connected');

  // Scenario 6: WebSocket upgrade on /ks/websocket (prefixed)
  const wsPrefixed = new WebSocket(`ws://127.0.0.1:${testPort}/ks/websocket`);
  const wsPrefixedMsg = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Prefixed WS timeout')), 3000);
    wsPrefixed.addEventListener('message', (event) => {
      clearTimeout(timer);
      resolve(String(event.data));
    });
    wsPrefixed.addEventListener('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
  wsPrefixed.close();
  assert.equal(wsPrefixedMsg, 'ddp-connected');

  // Scenario 7: Static file served under /ks/app.js (prefixed)
  const staticPrefixedRes = await fetch(`${baseUrl}/ks/app.js`);
  assert.equal(staticPrefixedRes.status, 200);
  assert.ok(staticPrefixedRes.headers.get('content-type').includes('javascript'));
  assert.equal(staticPrefixedRes.headers.get('etag'), '"h123"');
  assert.equal(await staticPrefixedRes.text(), 'console.log("static-client-file");');
});
