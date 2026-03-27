// Tests for the _redirectWebsocketEndpoint URL rewriting logic in stream_server.js.
// Verifies that /websocket requests are correctly redirected to /sockjs/websocket.

var http = Npm.require('http');

function makeRequest(path) {
  return new Promise(function(resolve, reject) {
    var port = WebApp.httpServer.address().port;
    var options = {
      hostname: 'localhost',
      port: port,
      path: path,
      method: 'GET'
    };
    var req = http.request(options, function(res) {
      var body = '';
      res.on('data', function(chunk) { body += chunk; });
      res.on('end', function() {
        resolve({ statusCode: res.statusCode, body: body, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

Tinytest.addAsync(
  'stream server - /websocket endpoint is handled',
  async function(test) {
    // A GET to /websocket should be handled by sockjs (rewritten to /sockjs/websocket).
    // SockJS responds with "Welcome to SockJS!\n" for GET requests to its websocket endpoint.
    var res = await makeRequest('/websocket');
    test.equal(res.statusCode, 200);
    test.equal(res.body, 'Welcome to SockJS!\n');
  }
);

Tinytest.addAsync(
  'stream server - /websocket/ with trailing slash is handled',
  async function(test) {
    var res = await makeRequest('/websocket/');
    test.equal(res.statusCode, 200);
    test.equal(res.body, 'Welcome to SockJS!\n');
  }
);

Tinytest.addAsync(
  'stream server - /websocket preserves query string',
  async function(test) {
    // SockJS should still handle the request even with a query string.
    var res = await makeRequest('/websocket?foo=bar');
    test.equal(res.statusCode, 200);
    test.equal(res.body, 'Welcome to SockJS!\n');
  }
);

Tinytest.addAsync(
  'stream server - non-websocket paths are not rewritten',
  async function(test) {
    // A request to /sockjs/info should return valid JSON (sockjs info endpoint).
    var res = await makeRequest('/sockjs/info');
    test.equal(res.statusCode, 200);
    var info = JSON.parse(res.body);
    test.isTrue(info.websocket !== undefined);
  }
);
