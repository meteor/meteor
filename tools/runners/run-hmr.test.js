// Unit tests for the HMR websocket message handling in run-hmr.js

const { EventEmitter } = require('events');

// run-hmr.js only needs these modules for code paths that are not exercised
// here, so they are stubbed out to keep the test dependency-free.
jest.mock('ws', () => ({ Server: class {} }), { virtual: true });
jest.mock('anser', () => ({}), { virtual: true });
jest.mock('./run-log.js', () => ({ getLog: () => [] }));
jest.mock('../cordova/builder.js', () => ({
  CordovaBuilder: { createCordovaServerPort: () => 12555 },
}));

const { HMRServer } = require('./run-hmr.js');

const SECRET = 'a'.repeat(128);
const APP_ID = 'synthetic-app-id';
const ARCH = 'web.browser';
const CHANGE_CONTENT = 'SYNTHETIC_CHANGED_CLIENT_SOURCE';

class FakeConnection extends EventEmitter {
  constructor() {
    super();
    this.sent = [];
    this.closed = false;
  }

  send(message) {
    this.sent.push(JSON.parse(message));
  }

  close() {
    this.closed = true;
  }
}

function createServer() {
  const server = new HMRServer({
    proxy: { started: true },
    hmrPath: '/__meteor__hmr__/websocket',
    secret: SECRET,
    projectContext: { appIdentifier: APP_ID },
  });

  server.changeSetsByArch[ARCH] = [{
    id: 'change-1',
    linkedAt: 100,
    reloadable: true,
    changedFiles: [{ path: '/client/main.js', content: CHANGE_CONTENT }],
  }];
  server.trimmedArchUntil[ARCH] = -1;

  return server;
}

function connect(server, headers = {}) {
  const conn = new FakeConnection();
  server._handleWsConn(conn, { headers });
  return conn;
}

function send(conn, message) {
  conn.emit('message', Buffer.from(
    typeof message === 'string' ? message : JSON.stringify(message)
  ));
}

function register(conn, overrides = {}) {
  send(conn, {
    type: 'register',
    arch: ARCH,
    appId: APP_ID,
    secret: SECRET,
    ...overrides,
  });
}

function isRegistered(server, conn, arch = ARCH) {
  return !!server.connByArch.get(arch)?.has(conn);
}

function receivedChanges(conn) {
  return JSON.stringify(conn.sent).includes(CHANGE_CONTENT);
}

describe('HMRServer websocket', () => {
  describe('malformed messages', () => {
    test.each([
      ['invalid JSON', '{'],
      ['null', 'null'],
      ['an array', '[]'],
      ['a string', '"register"'],
      ['a number', '42'],
      ['an unknown type', { type: 'synthetic-unknown' }],
      ['a non-string type', { type: 42 }],
      ['register without an arch', { type: 'register', appId: APP_ID, secret: SECRET }],
      ['register with a non-string arch', { type: 'register', arch: {}, appId: APP_ID, secret: SECRET }],
      ['register with an inherited-property arch', { type: 'register', arch: '__proto__', appId: APP_ID, secret: SECRET }],
      ['register with a null secret', { type: 'register', arch: ARCH, appId: APP_ID, secret: null }],
      ['register with a multi-byte secret of the same length', { type: 'register', arch: ARCH, appId: APP_ID, secret: 'é'.repeat(128) }],
    ])('%s does not throw and closes the socket', (_name, message) => {
      const server = createServer();
      const conn = connect(server);

      expect(() => send(conn, message)).not.toThrow();
      expect(conn.closed).toBe(true);
      expect(server.connByArch.size).toBe(0);
    });

    test.each([
      ['a non-string arch', { type: 'request-changes', arch: 1, after: 0 }],
      ['an inherited-property arch', { type: 'request-changes', arch: 'constructor', after: 0 }],
      ['a non-number after', { type: 'request-changes', arch: ARCH, after: 'x' }],
    ])('request-changes with %s from a registered client does not throw', (_name, message) => {
      const server = createServer();
      const conn = connect(server);
      register(conn);
      expect(isRegistered(server, conn)).toBe(true);

      expect(() => send(conn, message)).not.toThrow();
      expect(conn.closed).toBe(true);
    });

    test('socket errors (e.g. invalid frames) are handled', () => {
      const server = createServer();
      const conn = connect(server);

      expect(() => {
        conn.emit('error', new Error('Invalid WebSocket frame'));
      }).not.toThrow();
    });
  });

  describe('registration', () => {
    test.each([
      ['no Origin', {}],
      ['a same-origin Origin', { origin: 'http://localhost:3000' }],
      ['a ROOT_URL with a different host and port', { origin: 'http://dev.example.test:8080' }],
      ['a proxied dev server', { origin: 'https://proxy.example.test' }],
      ['the Cordova origin', { origin: 'http://localhost:12555' }],
    ])('accepts the correct secret with %s', (_name, headers) => {
      const server = createServer();
      const conn = connect(server, headers);

      register(conn);
      send(conn, { type: 'request-changes', arch: ARCH, after: 0 });

      expect(conn.closed).toBe(false);
      expect(isRegistered(server, conn)).toBe(true);
      expect(receivedChanges(conn)).toBe(true);
    });

    test('accepts request-changes without "after"', () => {
      const server = createServer();
      const conn = connect(server);

      register(conn);
      send(conn, { type: 'request-changes', arch: ARCH });

      expect(conn.closed).toBe(false);
      expect(conn.sent).toEqual([{ type: 'changes', changeSets: [] }]);
    });

    test.each([
      ['a remote origin', { origin: 'https://attacker.example.test' }],
      ['a forged Cordova origin', { origin: 'http://localhost:12555' }],
    ])('rejects a missing secret with %s', (_name, headers) => {
      const server = createServer();
      const conn = connect(server, headers);

      register(conn, { secret: undefined });
      send(conn, { type: 'request-changes', arch: ARCH, after: 0 });

      expect(conn.sent[0]).toEqual({ type: 'register-failed', reason: 'wrong-secret' });
      expect(conn.closed).toBe(true);
      expect(isRegistered(server, conn)).toBe(false);
      expect(receivedChanges(conn)).toBe(false);
    });

    test('rejects a wrong secret', () => {
      const server = createServer();
      const conn = connect(server);

      register(conn, { secret: 'b'.repeat(128) });

      expect(conn.sent).toEqual([{ type: 'register-failed', reason: 'wrong-secret' }]);
      expect(conn.closed).toBe(true);
      expect(isRegistered(server, conn)).toBe(false);
    });

    test('rejects a different app even with the correct secret', () => {
      const server = createServer();
      const conn = connect(server, { origin: 'http://localhost:12555' });

      register(conn, { appId: 'wrong-app' });
      send(conn, { type: 'request-changes', arch: ARCH, after: 0 });

      // wrong-secret is what stops the client from reconnecting
      expect(conn.sent).toEqual([
        { type: 'register-failed', reason: 'wrong-app' },
        { type: 'register-failed', reason: 'wrong-secret' },
      ]);
      expect(conn.closed).toBe(true);
      expect(isRegistered(server, conn)).toBe(false);
      expect(receivedChanges(conn)).toBe(false);
    });

    test('ignores request-changes before registering', () => {
      const server = createServer();
      const conn = connect(server);

      send(conn, { type: 'request-changes', arch: ARCH, after: 0 });

      expect(conn.sent).toEqual([]);
      expect(receivedChanges(conn)).toBe(false);
    });

    test('removes the connection when it closes', () => {
      const server = createServer();
      const conn = connect(server);

      register(conn);
      expect(isRegistered(server, conn)).toBe(true);

      conn.emit('close');
      expect(isRegistered(server, conn)).toBe(false);
    });
  });
});
