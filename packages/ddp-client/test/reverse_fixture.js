// Hermetic in-process DDP server used by the
// "livedata connection - reconnect to a different server" test.
//
// The original test connected DDP.connect() to reverse.meteor.com so it had a
// real first endpoint to reconnect away from. That endpoint is a 13-year-old
// public demo app we don't control, with a 5s polling deadline — it flakes
// on WAN latency and silently rots the day it goes offline. The test's actual
// concern is the client's reconnect({url}) re-pointing logic, which has
// nothing to do with the public internet.
//
// This fixture stands up a tiny WebSocket server on 127.0.0.1:<random> that
// speaks just enough of the DDP wire protocol to satisfy the test:
// connect/connected, ping/pong, and the `reverse` method. It uses only Node
// built-ins so the fixture introduces no new package dependencies.

const http = Npm.require('http');
const crypto = Npm.require('crypto');

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function acceptKey(clientKey) {
  return crypto.createHash('sha1').update(clientKey + WS_GUID).digest('base64');
}

// Encode a single text frame for server→client (unmasked, FIN=1, opcode=0x1).
function encodeTextFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 0x10000) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

// Parse a single frame from a client→server buffer. Returns null if more
// bytes are needed. Returns { opcode, text, consumed } on success.
function parseFrame(buf) {
  if (buf.length < 2) return null;
  const opcode = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let len = buf[1] & 0x7f;
  let offset = 2;
  if (len === 126) {
    if (buf.length < 4) return null;
    len = buf.readUInt16BE(2);
    offset = 4;
  } else if (len === 127) {
    if (buf.length < 10) return null;
    len = Number(buf.readBigUInt64BE(2));
    offset = 10;
  }
  let mask;
  if (masked) {
    if (buf.length < offset + 4) return null;
    mask = buf.slice(offset, offset + 4);
    offset += 4;
  }
  if (buf.length < offset + len) return null;
  let payload = buf.slice(offset, offset + len);
  if (masked) {
    payload = Buffer.from(payload);
    for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
  }
  return {
    opcode,
    text: opcode === 0x1 ? payload.toString('utf8') : null,
    consumed: offset + len,
  };
}

ReverseFixture = {
  // Start a fixture server on a random localhost port. Resolves with
  //   { url: 'http://127.0.0.1:<port>', stop: () => Promise<void> }.
  // The URL form lets DDP.connect() do its usual scheme translation
  // (http → ws, append /websocket).
  start() {
    return new Promise((resolve) => {
      const httpServer = http.createServer((req, res) => {
        res.writeHead(404);
        res.end();
      });

      httpServer.on('upgrade', (req, socket) => {
        if ((req.headers.upgrade || '').toLowerCase() !== 'websocket') {
          socket.destroy();
          return;
        }

        const accept = acceptKey(req.headers['sec-websocket-key']);
        // We deliberately do not negotiate permessage-deflate. Faye on the
        // client side offers it but accepts a plain (uncompressed) session
        // when the server doesn't echo the extension header.
        socket.write(
          'HTTP/1.1 101 Switching Protocols\r\n' +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
        );

        const send = (obj) => socket.write(encodeTextFrame(JSON.stringify(obj)));

        let buf = Buffer.alloc(0);
        socket.on('data', (chunk) => {
          buf = Buffer.concat([buf, chunk]);
          while (true) {
            const frame = parseFrame(buf);
            if (!frame) break;
            buf = buf.slice(frame.consumed);
            if (frame.opcode === 0x8) { socket.end(); return; }
            if (frame.opcode !== 0x1) continue;

            let msg;
            try { msg = JSON.parse(frame.text); } catch { continue; }

            if (msg.msg === 'connect') {
              send({ msg: 'connected', session: 'reverse-fixture-session' });
            } else if (msg.msg === 'ping') {
              send({ msg: 'pong', id: msg.id });
            } else if (msg.msg === 'method' && msg.method === 'reverse') {
              const arg = (msg.params && msg.params[0]) || '';
              const result = String(arg).split('').reverse().join('');
              send({ msg: 'result', id: msg.id, result });
              send({ msg: 'updated', methods: [msg.id] });
            }
            // Other DDP messages (sub/unsub/disconnect) are intentionally
            // ignored — this fixture only needs to support the test.
          }
        });

        socket.on('error', () => {});
      });

      httpServer.listen(0, '127.0.0.1', () => {
        const { port } = httpServer.address();
        resolve({
          url: `http://127.0.0.1:${port}`,
          stop: () => new Promise((r) => httpServer.close(() => r())),
        });
      });
    });
  },
};
