import crypto from 'node:crypto';
import net from 'node:net';
import zlib from 'node:zlib';
import { WebApp } from 'meteor/webapp';
import {
  createProxyAddressTracker,
  decodeUwsAddress,
} from './uws.js';

const uws = Npm.require('uWebSockets.js');

Tinytest.add('ddp-server/uws - proxy address correlation is exact and single-use', test => {
  const addresses = createProxyAddressTracker();
  const forget = addresses.record(
    { localAddress: '127.0.0.1', localPort: 54321 },
    '::1'
  );

  test.equal(
    addresses.consume('127.0.0.2', 54321),
    '127.0.0.2',
    'the same port from a different peer must not consume the mapping'
  );
  test.equal(addresses.consume('127.0.0.1', 54321), '::1');
  test.equal(
    addresses.consume('127.0.0.1', 54321),
    '127.0.0.1',
    'a consumed mapping must not be replayable'
  );

  forget();
});

Tinytest.add('ddp-server/uws - proxy address cleanup cannot delete a reused key', test => {
  const addresses = createProxyAddressTracker();
  const socket = { localAddress: '127.0.0.1', localPort: 54322 };
  const forgetOld = addresses.record(socket, '192.0.2.1');
  addresses.record(socket, '192.0.2.2');

  forgetOld();
  test.equal(addresses.consume('127.0.0.1', 54322), '192.0.2.2');
});

Tinytest.add('ddp-server/uws - proxy address correlation normalizes IPv6', test => {
  const addresses = createProxyAddressTracker();
  addresses.record(
    { localAddress: '::1', localPort: 54323 },
    '2001:db8::42'
  );

  test.equal(
    addresses.consume('0000:0000:0000:0000:0000:0000:0000:0001', 54323),
    '2001:db8::42'
  );
});

Tinytest.add('ddp-server/uws - native addresses decode for direct fallback', test => {
  test.equal(decodeUwsAddress(Buffer.from('127.0.0.1')), '127.0.0.1');
  test.equal(decodeUwsAddress(Buffer.from('2001:db8::1')), '2001:db8::1');
});


Tinytest.addAsync(
  'ddp-server/uws - LIBUS_LISTEN_EXCLUSIVE_PORT prevents SO_REUSEPORT collision',
  function (test, onComplete) {
    const host = '127.0.0.1';

    const app1 = uws.App();
    const app2 = uws.App();
    let token1 = null;
    let token2 = null;
    let waiting = 2;

    function maybeFinish() {
      if (--waiting > 0) return;

      test.isTrue(
        !!token1,
        'first listen with LIBUS_LISTEN_EXCLUSIVE_PORT should succeed'
      );
      test.isFalse(
        !!token2,
        'second listen on the SAME (host, port) with EXCLUSIVE_PORT ' +
        'should return a falsy token — kernel must reject the bind ' +
        'instead of silently sharing via SO_REUSEPORT'
      );

      // Best-effort cleanup. uws.us_listen_socket_close throws if the
      // token is falsy, which is why we guard it.
      try {
        if (token1) uws.us_listen_socket_close(token1);
      } catch (e) { /* ignore */ }
      try {
        if (token2) uws.us_listen_socket_close(token2);
      } catch (e) { /* ignore */ }

      onComplete();
    }

    app1.listen(host, 0, uws.LIBUS_LISTEN_EXCLUSIVE_PORT, function (token) {
      token1 = token;
      if (!token1) {
        test.isTrue(false, 'could not listen for the first exclusive-port instance');
        onComplete();
        return;
      }
      const port = uws.us_socket_local_port(token1);
      // Only attempt the colliding listen after the first one settled,
      // so the result of app2 reflects the conflict and not a startup
      // race inside uws.
      app2.listen(host, port, uws.LIBUS_LISTEN_EXCLUSIVE_PORT, function (t) {
        token2 = t;
        maybeFinish();
      });
      maybeFinish();
    });
  }
);

Tinytest.addAsync(
  'ddp-server/uws - LIBUS_LISTEN_EXCLUSIVE_PORT enum exists and equals 1',
  function (test, onComplete) {

    test.equal(
      uws.LIBUS_LISTEN_EXCLUSIVE_PORT,
      1,
      'uws.LIBUS_LISTEN_EXCLUSIVE_PORT must be the integer flag 1; ' +
      'the listen-options bitmask in uWebSockets.js relies on this'
    );
    onComplete();
  }
);

Tinytest.add(
  'ddp-server/uws - settings read path goes through Meteor.settings',
  function (test) {
    const savedSettings = Meteor.settings;
    try {
      Meteor.settings = {
        packages: {
          'ddp-server': {
            uws: {
              port: 9999,
              host: '127.0.0.99',
              payloadLength: 99,
              timeout: 99,
            },
          },
        },
      };

      const seen = Meteor.settings?.packages?.['ddp-server']?.uws;
      test.isNotUndefined(
        seen,
        'Meteor.settings?.packages?.["ddp-server"]?.uws must be ' +
        'reachable via the optional-chain expression the transport uses'
      );
      test.equal(seen.port, 9999, 'uws.port must round-trip through Meteor.settings');
      test.equal(seen.host, '127.0.0.99', 'uws.host must round-trip through Meteor.settings');
      test.equal(seen.payloadLength, 99, 'uws.payloadLength must round-trip');
      test.equal(seen.timeout, 99, 'uws.timeout must round-trip');

      // And critically: the OLD read path must NOT see them — verifying
      // that populating Meteor.settings does not accidentally also
      // populate the client-side runtime-config object (which would
      // leak server settings to every browser session).
      const stale = (typeof __meteor_runtime_config__ === 'object' &&
        __meteor_runtime_config__ &&
        __meteor_runtime_config__.meteorSettings &&
        __meteor_runtime_config__.meteorSettings.packages &&
        __meteor_runtime_config__.meteorSettings.packages['ddp-server'] &&
        __meteor_runtime_config__.meteorSettings.packages['ddp-server'].uws);
      test.isUndefined(
        stale,
        '__meteor_runtime_config__.meteorSettings.packages["ddp-server"].uws ' +
        'must remain undefined on the server — populating it would leak ' +
        'private Meteor.settings into the client HTML via ' +
        'webapp_server.js encodeRuntimeConfig'
      );
    } finally {
      Meteor.settings = savedSettings;
    }
  }
);

Tinytest.add(
  'ddp-server/transport-selection - transport setting honoured via Meteor.settings',
  function (test) {
    const savedSettings = Meteor.settings;
    try {
      Meteor.settings = {
        packages: { 'ddp-server': { transport: 'uws' } },
      };

      const seen = Meteor.settings?.packages?.['ddp-server'];
      test.isNotUndefined(seen, 'transport setting must be reachable via Meteor.settings');
      test.equal(seen.transport, 'uws',
        'transport name must round-trip through ' +
        'Meteor.settings.packages["ddp-server"].transport');
    } finally {
      Meteor.settings = savedSettings;
    }
  }
);

// Why uws.js maps socket.close() onto socket.end().
//
// The socket contract in ./index.js requires close() to flush what send()
// queued, because livedata_server ends DDP version negotiation by sending
// 'failed' and closing in the same tick. uWS names its shutdowns the other
// way round: close() is the forceful one and drops the queued frame, end()
// is the graceful one and delivers it. This test pins that asymmetry down,
// so that a change in uWebSockets.js is caught here rather than through a
// silent negotiation failure.
function sendThenShutdown(shutdown, onResult) {
  const host = '127.0.0.1';
  const payload = JSON.stringify({ msg: 'failed', version: '1' });
  const app = uws.App();

  app.ws('/*', {
    open(socket) {
      socket.send(payload);
      socket[shutdown]();
    },
  });

  // Let the kernel reserve an available port rather than guessing one that
  // another suite or outgoing connection may already be using.
  app.listen(host, 0, uws.LIBUS_LISTEN_EXCLUSIVE_PORT, function (token) {
    if (!token) {
      onResult(null);
      return;
    }

    const received = [];
    let finished = false;
    const port = uws.us_socket_local_port(token);
    const socket = new WebSocket('ws://' + host + ':' + port);

    function finish() {
      if (finished) return;
      finished = true;
      Meteor.clearTimeout(timer);
      try { socket.close(); } catch (e) { /* ignore */ }
      try { uws.us_listen_socket_close(token); } catch (e) { /* ignore */ }
      onResult(received);
    }

    const timer = Meteor.setTimeout(finish, 3000);
    socket.addEventListener('message', function (event) {
      received.push(String(event.data));
    });
    // Assert a tick after the close, so a frame still in flight is counted.
    socket.addEventListener('close', function () {
      Meteor.setTimeout(finish, 50);
    });
    socket.addEventListener('error', function () { /* asserted through the frames */ });
  });
}

Tinytest.addAsync(
  'ddp-server/uws - end() delivers a frame sent in the same tick, close() drops it',
  function (test, onComplete) {
    sendThenShutdown('end', function (afterEnd) {
      test.isNotNull(afterEnd, 'could not listen for the end() case');
      if (afterEnd === null) {
        onComplete();
        return;
      }
      test.equal(
        afterEnd,
        [JSON.stringify({ msg: 'failed', version: '1' })],
        'end() must deliver the frame queued just before it'
      );

      sendThenShutdown('close', function (afterClose) {
        test.isNotNull(afterClose, 'could not listen for the close() case');
        if (afterClose === null) {
          onComplete();
          return;
        }
        test.equal(
          afterClose.length,
          0,
          'close() is expected to drop the queued frame; if this now passes, ' +
          'uWebSockets.js changed and the close()/end() adapter in uws.js ' +
          'should be revisited'
        );
        onComplete();
      });
    });
  }
);

// The global WebSocket inflates frames transparently, so it cannot tell a
// compressed frame from a plain one. This client offers permessage-deflate,
// records the RSV1 bit of every text frame and can send compressed frames.
const DEFLATE_TAIL = Buffer.from([0x00, 0x00, 0xff, 0xff]);

function deflateMessage(text) {
  return zlib.deflateRawSync(Buffer.from(text), {
    finishFlush: zlib.constants.Z_SYNC_FLUSH,
  }).subarray(0, -DEFLATE_TAIL.length);
}

function inflateMessage(payload) {
  return zlib.inflateRawSync(Buffer.concat([payload, DEFLATE_TAIL]), {
    finishFlush: zlib.constants.Z_SYNC_FLUSH,
  }).toString();
}

function clientFrame(text, compress) {
  const payload = compress ? deflateMessage(text) : Buffer.from(text);
  const first = 0x81 | (compress ? 0x40 : 0);
  const header = payload.length < 126
    ? Buffer.from([first, 0x80 | payload.length])
    : Buffer.from([first, 0x80 | 126, payload.length >> 8, payload.length & 0xff]);
  const mask = crypto.randomBytes(4);
  const masked = Buffer.from(payload.map((byte, i) => byte ^ mask[i % 4]));
  return Buffer.concat([header, mask, masked]);
}

function connectRawWebSocket(port, path) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    const frames = [];
    let buffer = Buffer.alloc(0);
    let client = null;
    let pending = null;

    socket.once('error', reject);
    socket.on('connect', () => {
      socket.write([
        `GET ${path} HTTP/1.1`,
        `Host: 127.0.0.1:${port}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        'Sec-WebSocket-Version: 13',
        `Sec-WebSocket-Key: ${crypto.randomBytes(16).toString('base64')}`,
        'Sec-WebSocket-Extensions: permessage-deflate; client_max_window_bits',
        '',
        '',
      ].join('\r\n'));
    });

    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!client) {
        const end = buffer.indexOf('\r\n\r\n');
        if (end === -1) return;
        const head = buffer.subarray(0, end).toString();
        buffer = buffer.subarray(end + 4);
        const extensions = /^sec-websocket-extensions:\s*(.*)$/im.exec(head);
        client = {
          status: head.split('\r\n')[0],
          extensions: extensions ? extensions[1] : '',
          send(text, compress) {
            socket.write(clientFrame(text, compress));
          },
          waitFor(condition, description) {
            return new Promise((resolveFrames, rejectFrames) => {
              const timer = Meteor.setTimeout(() => {
                pending = null;
                rejectFrames(new Error(
                  `timed out waiting for ${description}, got ${frames.length} frames`
                ));
              }, 5000);
              pending = () => {
                if (!condition(frames)) return;
                pending = null;
                Meteor.clearTimeout(timer);
                resolveFrames(frames);
              };
              pending();
            });
          },
          close() {
            socket.destroy();
          },
        };
        resolve(client);
      }

      while (buffer.length >= 2) {
        let length = buffer[1] & 0x7f;
        let offset = 2;
        if (length === 126) {
          if (buffer.length < 4) return;
          length = buffer.readUInt16BE(2);
          offset = 4;
        } else if (length === 127) {
          if (buffer.length < 10) return;
          length = Number(buffer.readBigUInt64BE(2));
          offset = 10;
        }
        if (buffer.length < offset + length) return;
        const opcode = buffer[0] & 0x0f;
        const compressed = (buffer[0] & 0x40) !== 0;
        const payload = buffer.subarray(offset, offset + length);
        buffer = buffer.subarray(offset + length);
        if (opcode !== 0x1) continue;
        frames.push({
          compressed,
          text: compressed ? inflateMessage(payload) : payload.toString(),
        });
        if (pending) pending();
      }
    });
  });
}

// Why uws.js wraps socket.send(): uWS compresses a message only when the third
// argument of send() is true, even after permessage-deflate was negotiated.
Tinytest.addAsync(
  'ddp-server/uws - send() compresses only when its third argument is true',
  async function (test) {
    const payload = JSON.stringify({ msg: 'added', fields: { text: 'x'.repeat(2048) } });
    const app = uws.App();
    app.ws('/*', {
      compression: uws.SHARED_COMPRESSOR,
      open(socket) {
        socket.send(payload);
        socket.send(payload, false, true);
      },
    });

    const token = await new Promise(resolve => {
      app.listen('127.0.0.1', 0, uws.LIBUS_LISTEN_EXCLUSIVE_PORT, resolve);
    });
    test.isTrue(!!token, 'could not listen');
    if (!token) return;

    let client = null;
    try {
      client = await connectRawWebSocket(uws.us_socket_local_port(token), '/');
      test.matches(client.extensions, /^permessage-deflate/);
      const frames = await client.waitFor(received => received.length >= 2, 'two frames');
      test.equal(
        frames.map(frame => frame.compressed),
        [false, true],
        'if the first frame is now compressed, uWebSockets.js changed and ' +
        'the send() adapter in uws.js should be revisited'
      );
      test.equal(frames.map(frame => frame.text), [payload, payload]);
    } finally {
      if (client) client.close();
      uws.us_listen_socket_close(token);
    }
  }
);

if (__meteor_runtime_config__.DDP_TRANSPORT === 'uws') {
  Tinytest.addAsync(
    'ddp-server/uws - SERVER_WEBSOCKET_COMPRESSION controls DDP compression',
    async function (test) {
      // stream_server.js disables compression only for a falsy JSON value.
      const setting = process.env.SERVER_WEBSOCKET_COMPRESSION;
      const enabled = !setting || !!JSON.parse(setting);
      const pathPrefix = __meteor_runtime_config__.ROOT_URL_PATH_PREFIX || '';
      const client = await connectRawWebSocket(
        WebApp.httpServer.address().port,
        `${pathPrefix}/websocket`
      );
      try {
        test.equal(client.status, 'HTTP/1.1 101 Switching Protocols');
        test.equal(client.extensions.startsWith('permessage-deflate'), enabled);

        client.send(
          JSON.stringify({ msg: 'connect', version: '1', support: ['1'] }),
          enabled
        );
        const isConnected = frame => JSON.parse(frame.text).msg === 'connected';
        const frames = await client.waitFor(
          received => received.some(isConnected),
          'the answer to the connect message'
        );
        test.equal(
          frames.find(isConnected).compressed,
          enabled,
          'the server must compress what it sends exactly when compression is enabled'
        );
      } finally {
        client.close();
      }
    }
  );
}
