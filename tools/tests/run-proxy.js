var http = require('http');
var net = require('net');

var selftest = require('../tool-testing/selftest.js');
var Proxy = require('../runners/run-proxy.js').Proxy;

selftest.define(
  "dev proxy releases abandoned websocket upgrades",
  testAbandonedWebsocketUpgrades
);

/**
 * Verifies abandoned websocket upgrades do not exhaust the dev proxy's shared
 * HTTP agent and block later non-websocket requests.
 */
async function testAbandonedWebsocketUpgrades() {
  var targetSockets = [];
  var clientSockets = [];

  var target = http.createServer(function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  });

  target.on('upgrade', function (req, socket) {
    targetSockets.push(socket);
    socket.on('error', function () {});
  });

  await listen(target, '127.0.0.1');

  var proxy = new Proxy({
    listenPort: 0,
    listenHost: '127.0.0.1',
    proxyToPort: target.address().port,
    proxyToHost: '127.0.0.1'
  });

  try {
    await proxy.start();
    proxy.setMode("proxy");

    var proxyPort = proxy.server.address().port;
    var upgradeCount = proxy.proxyAgent?.maxSockets || 100;
    for (var i = 0; i < upgradeCount; i++) {
      clientSockets.push(await openWebsocketUpgrade(proxyPort));
    }

    await waitUntil(function () {
      return targetSockets.length === upgradeCount;
    });

    await destroySockets(clientSockets);

    await expectHttpResponse(proxyPort, 'ok');
  } finally {
    await destroySockets(clientSockets);
    await destroySockets(targetSockets);
    proxy.stop();
    await closeServer(target);
  }
}

/**
 * Starts an HTTP server on an ephemeral port.
 */
function listen(server, host) {
  return new Promise(function (resolve, reject) {
    server.once('error', reject);
    server.listen(0, host, function () {
      server.removeListener('error', reject);
      resolve();
    });
  });
}

/**
 * Opens a raw websocket upgrade request and leaves the upgrade unresolved.
 */
function openWebsocketUpgrade(port) {
  return new Promise(function (resolve, reject) {
    var socket = net.connect({ host: '127.0.0.1', port: port }, function () {
      socket.write([
        'GET /websocket HTTP/1.1',
        'Host: 127.0.0.1:' + port,
        'Connection: Upgrade',
        'Upgrade: websocket',
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
        'Sec-WebSocket-Version: 13',
        '',
        ''
      ].join('\r\n'));
      resolve(socket);
    });

    socket.once('error', reject);
  });
}

/**
 * Polls until the provided condition is true.
 */
async function waitUntil(fn) {
  var start = Date.now();
  while (! fn()) {
    if (Date.now() - start > 5000) {
      throw new Error('Timed out waiting for websocket upgrades to reach target');
    }
    await sleep(25);
  }
}

/**
 * Waits for a socket to emit close if it has not already closed.
 */
function waitForSocketToClose(socket) {
  if (socket.destroyed || socket.closed) {
    return Promise.resolve();
  }

  return new Promise(function (resolve) {
    socket.once('close', resolve);
  });
}

/**
 * Destroys sockets and waits for their close events.
 */
function destroySockets(sockets) {
  var closePromises = sockets.map(waitForSocketToClose);
  sockets.forEach(function (socket) {
    socket.destroy();
  });
  return Promise.all(closePromises);
}

/**
 * Closes an HTTP server and waits for the close callback.
 */
function closeServer(server) {
  return new Promise(function (resolve, reject) {
    server.close(function (err) {
      if (! err || err.code === 'ERR_SERVER_NOT_RUNNING') {
        resolve();
      } else {
        reject(err);
      }
    });
  });
}

/**
 * Waits for the given amount of time.
 */
function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

/**
 * Asserts the proxy still serves normal HTTP requests.
 */
function expectHttpResponse(port, expectedBody) {
  return new Promise(function (resolve, reject) {
    var req = http.get({
      host: '127.0.0.1',
      port: port,
      path: '/',
      agent: false
    }, function (res) {
      var body = '';
      res.setEncoding('utf8');
      res.on('data', function (chunk) {
        body += chunk;
      });
      res.on('end', function () {
        clearTimeout(timeout);
        if (res.statusCode !== 200 || body !== expectedBody) {
          reject(new Error(
            'Expected HTTP 200 "' + expectedBody + '", got ' +
            res.statusCode + ' "' + body + '"'
          ));
        } else {
          resolve();
        }
      });
    });

    var timeout = setTimeout(function () {
      req.destroy();
      reject(new Error('Timed out waiting for HTTP response through proxy'));
    }, 2000);

    req.on('error', function (err) {
      clearTimeout(timeout);
      reject(err);
    });
  });
}
