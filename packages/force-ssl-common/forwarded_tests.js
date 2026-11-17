// Covers the proxy-header parsing that replaced the forwarded-http npm
// dependency (./forwarded.js), through the package's public helpers.
import http from 'http';
import { isLocalConnection, isSslConnection } from './force_ssl_common';

const PEER = '203.0.113.10';

const makeRequest = ({ remoteAddress = PEER, encrypted, headers = {} } = {}) => {
  const req = new http.IncomingMessage();
  // req.connection is an alias of req.socket.
  req.socket = { remoteAddress, encrypted };
  req.headers = headers;
  return req;
};

Tinytest.add('force-ssl - SSL detection from proxy headers', function (test) {
  const isSsl = (headers, options) =>
    !!isSslConnection(makeRequest({ headers, ...options }));

  test.isTrue(isSsl({}, { encrypted: true }), 'TLS socket');
  test.isFalse(isSsl({}), 'plain socket, no headers');

  // RFC 7239 Forwarded: case-insensitive parameter names, quoted values,
  // and multi-hop lists where any hop reported https.
  test.isTrue(isSsl({ forwarded: 'for=192.0.2.60;proto=https;by=203.0.113.43' }));
  test.isTrue(isSsl({ forwarded: 'For="[2001:db8::1]:4711"; Proto="https"' }));
  test.isTrue(isSsl({ forwarded: 'for=192.0.2.60;proto=http, for=198.51.100.17;proto=https' }));
  test.isTrue(isSsl({ forwarded: 'for=192.0.2.60;proto=https, for=198.51.100.17;proto=http' }));
  test.isFalse(isSsl({ forwarded: 'for=192.0.2.60;proto=http, for=198.51.100.17;proto=http' }));
  test.isFalse(isSsl({ forwarded: 'for=192.0.2.60;proto=HTTPS' }), 'proto is case-sensitive');
  test.isFalse(isSsl({ forwarded: 'for=192.0.2.60' }), 'no proto parameter');

  // Forwarded proto= overrides the X-Forwarded-* family, in both directions.
  test.isTrue(isSsl({ 'x-forwarded-proto': 'http', forwarded: 'proto=https' }));
  test.isFalse(isSsl({ 'x-forwarded-proto': 'https', forwarded: 'proto=http' }));
  test.isFalse(isSsl({ forwarded: 'proto=http' }, { encrypted: true }));

  // X-Forwarded-Proto is matched as a substring, so a hop list containing
  // https counts.
  test.isTrue(isSsl({ 'x-forwarded-proto': 'https' }));
  test.isTrue(isSsl({ 'x-forwarded-proto': 'http, https' }));
  test.isFalse(isSsl({ 'x-forwarded-proto': 'http' }));

  // Alias headers, where a later header in forwarded-http's order wins.
  ['x-forwarded-protocol', 'z-forwarded-proto', 'z-forwarded-protocol', 'x-real-proto', 'x-url-scheme']
    .forEach((name) => {
      test.isTrue(isSsl({ [name]: 'https' }), name);
      test.isFalse(isSsl({ 'x-forwarded-proto': 'https', [name]: 'http' }), name);
    });

  // Flag headers set by specific proxies and CDNs; they win over the
  // protocol headers above.
  test.isTrue(isSsl({ 'front-end-https': 'on', 'x-forwarded-proto': 'http' }));
  test.isTrue(isSsl({ 'x-forwarded-ssl': 'on' }));
  test.isFalse(isSsl({ 'x-forwarded-ssl': 'off' }));
  test.isTrue(isSsl({ 'fastly-ssl': '1' }));
  test.isTrue(isSsl({ 'fastly-ssl': 'true' }));
  test.isTrue(isSsl({ 'cf-visitor': '{"scheme":"https"}' }));
  test.isFalse(isSsl({ 'cf-visitor': '{"scheme":"http"}', 'x-forwarded-proto': 'https' }));
  test.isFalse(isSsl({ 'cf-visitor': 'not json' }));
});

Tinytest.add('force-ssl - local detection from proxy headers', function (test) {
  const isLocal = (remoteAddress, headers) =>
    isLocalConnection(makeRequest({ remoteAddress, headers }));

  // A local proxy reporting only local hops.
  test.isTrue(isLocal('127.0.0.1', { 'x-forwarded-for': '127.0.0.1, ::1' }));
  test.isTrue(isLocal('::1', { forwarded: 'for=127.0.0.1, for="[::1]"' }));
  test.isTrue(isLocal('127.0.0.1', { forwarded: 'for=127.0.0.1:3000;proto=http' }));

  // Any remote hop makes the connection non-local, whichever header reports it.
  test.isFalse(isLocal('127.0.0.1', { 'x-forwarded-for': '127.0.0.1, 198.51.100.17' }));
  test.isFalse(isLocal('127.0.0.1', { forwarded: 'for=127.0.0.1, for=198.51.100.17' }));
  test.isFalse(isLocal('127.0.0.1', { forwarded: 'for="[2001:db8::1]:4711"' }));
  test.isFalse(isLocal('127.0.0.1', { forwarded: 'for=unknown' }), 'obfuscated node');
  ['z-forwarded-for', 'fastly-client-ip', 'x-real-ip', 'x-cluster-client-ip', 'cf-connecting-ip']
    .forEach((name) => {
      test.isFalse(isLocal('127.0.0.1', { [name]: '198.51.100.17' }), name);
    });

  // Headers cannot make a remote peer local.
  test.isFalse(isLocal(PEER, {
    'x-forwarded-for': '127.0.0.1',
    forwarded: 'for=127.0.0.1',
  }));
});

Tinytest.add('force-ssl - crafted proxy headers do not throw or stall', function (test) {
  // forwarded-http threw a TypeError on these, which crashed the server from
  // the request listener.
  const proto = makeRequest({ headers: { forwarded: '__proto__=1;proto=https' } });
  test.isFalse(isLocalConnection(proto));
  test.isTrue(isSslConnection(proto));

  ['{"scheme":1}', '{"scheme":true}', '{"scheme":{}}', '{"scheme":["https"]}', 'null']
    .forEach((visitor) => {
      const req = makeRequest({ headers: { 'cf-visitor': visitor } });
      test.isFalse(isSslConnection(req), visitor);
    });

  // forwarded-http's address pattern backtracked exponentially on an
  // unterminated bracketed address; 40 groups would not finish in practice.
  const start = Date.now();
  const stall = makeRequest({
    remoteAddress: '127.0.0.1',
    headers: { forwarded: `for=[${'1:'.repeat(40)}x` },
  });
  test.isFalse(isLocalConnection(stall));
  test.isTrue(Date.now() - start < 1000, 'parsed without backtracking');
});
