var http = require('http');
var net = require('net');

var selftest = require('../tool-testing/selftest.js');
var Proxy = require('../runners/run-proxy.js').Proxy;

selftest.define("dev proxy releases abandoned websocket upgrades", async function () {
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
    for (var i = 0; i < 100; i++) {
      clientSockets.push(await openWebsocketUpgrade(proxyPort));
    }

    await waitUntil(function () {
      return targetSockets.length === 100;
    });

    clientSockets.forEach(function (socket) {
      socket.destroy();
    });

    await sleep(100);

    await expectHttpResponse(proxyPort, 'ok');
  } finally {
    clientSockets.forEach(function (socket) {
      socket.destroy();
    });
    targetSockets.forEach(function (socket) {
      socket.destroy();
    });
    proxy.stop();
    target.close();
  }
});

function listen(server, host) {
  return new Promise(function (resolve, reject) {
    server.once('error', reject);
    server.listen(0, host, function () {
      server.removeListener('error', reject);
      resolve();
    });
  });
}

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

async function waitUntil(fn) {
  var start = Date.now();
  while (! fn()) {
    if (Date.now() - start > 5000) {
      throw new Error('Timed out waiting for websocket upgrades to reach target');
    }
    await sleep(25);
  }
}

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

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
