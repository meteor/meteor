import { EventEmitter } from 'events';
import { redirectWebsocketEndpoint } from './sockjs.js';

// redirectWebsocketEndpoint only uses the EventEmitter listener API
// (listeners / removeAllListeners / addListener) and never touches the socket,
// so a bare EventEmitter is a faithful stand-in for the HTTP server.
function makeServer() {
  return new EventEmitter();
}

Tinytest.add(
  'ddp-server/sockjs - malformed request URL does not crash the request listener',
  function (test) {
    const server = makeServer();
    redirectWebsocketEndpoint(server, '', '/sockjs');

    ['//', '//%5Cexample.com'].forEach(function (badUrl) {
      const request = { url: badUrl };
      let thrown = null;
      // In production this listener runs on the HTTP server's 'request' event;
      // an exception here is uncaught and takes down the whole process.
      try {
        server.emit('request', request);
      } catch (err) {
        thrown = err;
      }
      test.isNull(
        thrown,
        'emitting a request with url ' + JSON.stringify(badUrl) +
        ' must not throw (got ' + (thrown && thrown.message) + ')'
      );
      test.equal(
        request.url,
        badUrl,
        'a malformed URL must be left untouched instead of rewritten'
      );
    });
  }
);

Tinytest.add(
  'ddp-server/sockjs - /websocket is still rewritten to /sockjs/websocket',
  function (test) {
    const server = makeServer();
    redirectWebsocketEndpoint(server, '', '/sockjs');

    [
      ['/websocket', '/sockjs/websocket'],
      ['/websocket/', '/sockjs/websocket'],
      ['/websocket?foo=bar', '/sockjs/websocket?foo=bar'],
      ['/some/other/path', '/some/other/path'],
    ].forEach(function (pair) {
      const input = pair[0];
      const expected = pair[1];
      const request = { url: input };
      server.emit('request', request);
      test.equal(
        request.url,
        expected,
        'request url ' + JSON.stringify(input) + ' should become ' +
        JSON.stringify(expected)
      );
    });
  }
);
