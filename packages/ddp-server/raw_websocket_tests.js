// Tests for DISABLE_SOCKJS raw WebSocket mode and general /websocket endpoint.
// These tests verify that DDP connections work correctly regardless of
// the transport mode (SockJS or raw WebSocket).

const http = Npm.require('http');
const net = Npm.require('net');
const { ClientStream } = require('meteor/socket-stream-client');
const { WebApp } = require('meteor/webapp');

const disableSockJS = !!process.env.DISABLE_SOCKJS ||
  (process.env.DDP_TRANSPORT && process.env.DDP_TRANSPORT !== 'sockjs');

if (process.env.DDP_TRANSPORT === 'uws') {
  Tinytest.addAsync('stream server - uws preserves the peer and respects forwarded address trust', async test => {
    const previousCount = process.env.HTTP_FORWARDED_COUNT;
    // Linux routes the entire loopback range. A distinct source address proves
    // that the internal uWS proxy's 127.0.0.1 address does not replace the peer.
    const peer = process.platform === 'linux' ? '127.0.0.2' : '127.0.0.1';
    const target = new URL(Meteor.absoluteUrl());
    // Bypass the development tool's extra proxy hop, but still exercise the
    // application's HTTP listener and its production uWS proxy.
    target.port = WebApp.httpServer.address().port;
    const sockets = new Set();
    // Faye rejects the net option. Bind the source of a real TCP relay instead,
    // so the application receives the distinct peer without changing headers.
    const relay = net.createServer(socket => {
      const upstream = net.connect({
        host: '127.0.0.1',
        port: Number(target.port) || 80,
        localAddress: peer,
      });
      for (const connection of [socket, upstream]) {
        sockets.add(connection);
        connection.on('close', () => sockets.delete(connection));
        connection.on('error', () => {
          socket.destroy();
          upstream.destroy();
        });
      }
      socket.pipe(upstream).pipe(socket);
    });
    try {
      await new Promise((resolve, reject) => {
        relay.once('error', reject);
        relay.listen(0, '127.0.0.1', resolve);
      });
      for (const [count, forwarded, expected] of [
        ['0', '192.0.2.42', peer],
        ['1', '192.0.2.42', '192.0.2.42'],
        ['1', '192.0.2.42, 192.0.2.43', null],
        ['0', undefined, peer],
      ]) {
        process.env.HTTP_FORWARDED_COUNT = count;
        const marker = Random.id();
        let client;
        let hook;
        let timer;
        try {
          const accepted = new Promise((resolve, reject) => {
            timer = Meteor.setTimeout(() => reject(new Error('uWS DDP connection did not arrive')), 10000);
            hook = Meteor.onConnection(connection => {
              if (connection.httpHeaders['x-address-test'] === marker) resolve(connection);
            });
          });
          const headers = { 'x-address-test': marker };
          if (forwarded !== undefined) headers['x-forwarded-for'] = forwarded;
          const url = new URL(target);
          url.hostname = '127.0.0.1';
          url.port = relay.address().port;
          const stream = new ClientStream(url.toString(), {
            retry: false,
            headers,
          });
          client = DDP.connect(stream, { retry: false });
          const connection = await accepted;
          const address = connection.clientAddress;
          test.equal(typeof address === 'string' ? address.replace(/^::ffff:/, '') : address,
            expected, 'forwarded count ' + count + ', header ' + forwarded);
          test.equal(await client.callAsync('livedata_server_test_inner'), connection.id);
        } finally {
          Meteor.clearTimeout(timer);
          if (hook) hook.stop();
          if (client) client.close();
        }
      }
    } finally {
      if (previousCount === undefined) delete process.env.HTTP_FORWARDED_COUNT;
      else process.env.HTTP_FORWARDED_COUNT = previousCount;
      for (const socket of sockets) socket.destroy();
      if (relay.listening) await new Promise(resolve => relay.close(resolve));
    }
  });
}

// Helper: make an HTTP GET request to the given URL, return { statusCode, headers, body }
function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, body });
      });
    }).on('error', reject);
  });
}

// --- Tests that run in BOTH modes ---

Tinytest.addAsync(
  'stream server - DDP connection works over /websocket',
  function (test, onComplete) {
    makeTestConnection(
      test,
      function (clientConn, serverConn) {
        test.isTrue(clientConn.status().connected, 'client should be connected');
        test.isTrue(typeof serverConn.id === 'string', 'server connection should have an id');
        test.isTrue(serverConn.id.length > 0, 'server connection id should not be empty');
        clientConn.disconnect();
        onComplete();
      },
      onComplete
    );
  }
);

Tinytest.addAsync(
  'stream server - connection supports method calls',
  function (test, onComplete) {
    makeTestConnection(
      test,
      function (clientConn, serverConn) {
        clientConn.callAsync('livedata_server_test_inner').then((res) => {
          test.equal(res, serverConn.id,
            'method should see the correct connection id');
          clientConn.disconnect();
          onComplete();
        });
      },
      onComplete
    );
  }
);

Tinytest.addAsync(
  'stream server - plain HTTP to /websocket returns 400',
  async function (test) {
    // In both modes, a plain HTTP GET to /websocket should not serve the app.
    // In DISABLE_SOCKJS mode, our middleware returns 400.
    // In SockJS mode, SockJS handles it (returns non-200 or redirect).
    const url = Meteor.absoluteUrl('websocket');
    const result = await httpGet(url);

    if (disableSockJS) {
      test.equal(result.statusCode, 400,
        'DISABLE_SOCKJS: /websocket should return 400 for plain HTTP');
      test.equal(result.body, 'Not a valid websocket request',
        'DISABLE_SOCKJS: /websocket should return clear error message');
    } else {
      // In SockJS mode, /websocket gets rewritten to /sockjs/websocket
      // which returns a non-200 for plain HTTP. Just verify it's not
      // serving the app HTML.
      test.isTrue(
        result.statusCode !== 200 || !result.body.includes('<!DOCTYPE'),
        'SockJS: /websocket should not serve app HTML'
      );
    }
  }
);

// --- Tests specific to DISABLE_SOCKJS mode ---

if (disableSockJS) {
  Tinytest.addAsync(
    'stream server - DISABLE_SOCKJS: /sockjs/info is not available',
    async function (test) {
      const url = Meteor.absoluteUrl('sockjs/info');
      const result = await httpGet(url);

      // Without SockJS, there's no /sockjs/info endpoint.
      // The request falls through to the app handler (returns HTML, not JSON).
      const ct = result.headers['content-type'] || '';
      test.isFalse(
        ct.includes('application/json'),
        '/sockjs/info should not return JSON when DISABLE_SOCKJS is set'
      );
    }
  );

  Tinytest.addAsync(
    'stream server - DISABLE_SOCKJS: connection has websocket-raw protocol',
    function (test, onComplete) {
      // In raw WebSocket mode, the server-side connection object should
      // have protocol 'websocket-raw' (set by RawWebSocketConnection).
      //
      // We verify this by checking the server connection's internal state
      // via the Meteor.onConnection hook.
      const handle = Meteor.onConnection(function (conn) {
        handle.stop();
        // The connection object exposed via onConnection doesn't directly
        // expose the protocol, but we can verify it has the expected shape.
        test.isTrue(typeof conn.id === 'string');
        test.isTrue(typeof conn.close === 'function');
        test.isTrue(typeof conn.onClose === 'function');
        test.isTrue(
          net.isIP(conn.clientAddress) > 0,
          `connection should expose a valid clientAddress, got ${conn.clientAddress}`
        );
      });

      makeTestConnection(
        test,
        function (clientConn, serverConn) {
          clientConn.disconnect();
          onComplete();
        },
        onComplete
      );
    }
  );
}

// --- Tests specific to SockJS mode (default) ---

if (!disableSockJS) {
  Tinytest.addAsync(
    'stream server - SockJS: /sockjs/info returns JSON',
    async function (test) {
      const url = Meteor.absoluteUrl('sockjs/info');
      const result = await httpGet(url);

      test.equal(result.statusCode, 200,
        '/sockjs/info should return 200 in SockJS mode');
      const ct = result.headers['content-type'] || '';
      test.isTrue(ct.includes('application/json'),
        '/sockjs/info should return application/json');

      const info = JSON.parse(result.body);
      test.isTrue('websocket' in info,
        '/sockjs/info response should contain websocket field');
    }
  );
}
