// Tests for the _redirectWebsocketEndpoint URL rewriting logic in stream_server.js.
// Verifies that /websocket requests are correctly redirected to /sockjs/websocket.

const http = Npm.require('http');

function makeRequest(path) {
  return new Promise(function (resolve, reject) {
    const port = WebApp.httpServer.address().port;
    const options = {
      hostname: 'localhost',
      port,
      path,
      method: 'GET',
    };
    const req = http.request(options, function (res) {
      let body = '';
      res.on('data', function (chunk) {
        body += chunk;
      });
      res.on('end', function () {
        resolve({ statusCode: res.statusCode, body, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function makeUpgradeRequest(path) {
  return new Promise(function (resolve, reject) {
    const port = WebApp.httpServer.address().port;
    const options = {
      hostname: 'localhost',
      port,
      path,
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
      },
    };
    const req = http.request(options);
    req.on('upgrade', function (res, socket) {
      socket.destroy();
      resolve({ statusCode: 101, upgrade: true });
    });
    req.on('response', function (res) {
      resolve({ statusCode: res.statusCode, upgrade: false });
    });
    req.on('error', reject);
    req.end();
  });
}

Tinytest.addAsync(
  'stream server - /websocket endpoint is handled',
  async function (test) {
    // A GET to /websocket should be handled by sockjs (rewritten to /sockjs/websocket).
    // SockJS responds with "Welcome to SockJS!\n" for GET requests to its websocket endpoint.
    const res = await makeRequest('/websocket');
    test.equal(res.statusCode, 200);
    test.equal(res.body, 'Welcome to SockJS!\n');
  },
);

Tinytest.addAsync(
  'stream server - /websocket/ with trailing slash is handled',
  async function (test) {
    const res = await makeRequest('/websocket/');
    test.equal(res.statusCode, 200);
    test.equal(res.body, 'Welcome to SockJS!\n');
  },
);

Tinytest.addAsync(
  'stream server - /websocket preserves query string',
  async function (test) {
    // SockJS should still handle the request even with a query string.
    const res = await makeRequest('/websocket?foo=bar');
    test.equal(res.statusCode, 200);
    test.equal(res.body, 'Welcome to SockJS!\n');
  },
);

Tinytest.addAsync(
  'stream server - non-websocket paths are not rewritten',
  async function (test) {
    // A request to /sockjs/info should return valid JSON (sockjs info endpoint).
    const res = await makeRequest('/sockjs/info');
    test.equal(res.statusCode, 200);
    const info = JSON.parse(res.body);
    test.isTrue(info.websocket !== undefined);
  },
);

Tinytest.addAsync(
  'stream server - websocket upgrade on /websocket is rewritten',
  async function (test) {
    // A WebSocket upgrade request to /websocket should be rewritten to
    // /sockjs/websocket and accepted by the SockJS server.
    const res = await makeUpgradeRequest('/websocket');
    test.isTrue(res.upgrade);
    test.equal(res.statusCode, 101);
  },
);
