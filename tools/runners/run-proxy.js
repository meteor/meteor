var _ = require('underscore');
var Future = require('fibers/future');
var runLog = require('./run-log.js');

// options: listenPort, proxyToPort, proxyToHost, onFailure
var Proxy = function (options) {
  var self = this;

  self.listenPort = options.listenPort;
  self.listenHost = options.listenHost;
  // note: run-all.js updates proxyToPort directly
  self.proxyToPort = options.proxyToPort;
  self.proxyToHost = options.proxyToHost || '127.0.0.1';
  self.onFailure = options.onFailure || function () {};

  self.mode = "hold";
  self.httpQueue = []; // keys: req, res
  self.websocketQueue = []; // keys: req, socket, head

  self.proxy = null;
  self.server = null;
};

_.extend(Proxy.prototype, {
  // Start the proxy server, block (yield) until it is ready to go
  // (actively listening on outer and proxying to inner), and then
  // return.
  start: function () {
    var self = this;

    if (self.server)
      throw new Error("already running?");

    self.started = false;

    var http = require('http');
    var net = require('net');
    var httpProxy = require('http-proxy');

    self.proxy = httpProxy.createProxyServer({
      // agent is required to handle keep-alive, and http-proxy 1.0 is a little
      // buggy without it: https://github.com/nodejitsu/node-http-proxy/pull/488
      agent: new http.Agent({ maxSockets: 100 }),
      xfwd: true
    });

    var server = self.server = http.createServer(function (req, res) {
      // Normal HTTP request
      self.httpQueue.push({ req: req, res: res });
      self._tryHandleConnections();
    });

    self.server.on('upgrade', function (req, socket, head) {
      // Websocket connection
      self.websocketQueue.push({ req: req, socket: socket, head: head });
      self._tryHandleConnections();
    });

    var fut = new Future;
    self.server.on('error', function (err) {
      if (err.code === 'EADDRINUSE') {
        var port = self.listenPort;
        runLog.log(
"Can't listen on port " + port + ". Perhaps another Meteor is running?\n" +
"\n" +
"Running two copies of Meteor in the same application directory\n" +
"will not work. If something else is using port " + port + ", you can\n" +
"specify an alternative port with --port <port>.");
      } else if (self.listenHost &&
                 (err.code === 'ENOTFOUND' || err.code === 'EADDRNOTAVAIL')) {
        // This handles the case of "entered a DNS name that's unknown"
        // (ENOTFOUND from getaddrinfo) and "entered some random IP that we
        // can't bind to" (EADDRNOTAVAIL from listen).
        runLog.log(
"Can't listen on host " + self.listenHost + " (" + err.code + " from " +
            err.syscall + ").");

      } else {
        runLog.log('' + err);
      }
      self.onFailure();
      // Allow start() to return.
      fut.isResolved() || fut['return']();
    });

    // Don't crash if the app doesn't respond. instead return an error
    // immediately. This shouldn't happen much since we try to not
    // send requests if the app is down.
    //
    // Currently, this error is emitted if the proxy->server connection has an
    // error (whether in HTTP or websocket proxying).  It is not emitted if the
    // client->proxy connection has an error, though this may change; see
    // discussion at https://github.com/nodejitsu/node-http-proxy/pull/488
    self.proxy.on('error', function (err, req, resOrSocket) {
      if (resOrSocket instanceof http.ServerResponse) {
        if (!resOrSocket.headersSent) {
          // Return a 503, but only if we haven't already written headers (or
          // we'll get an ugly crash about rendering headers twice).  end()
          // doesn't crash if called twice so we don't have to conditionalize
          // that call.
          resOrSocket.writeHead(503, {
            'Content-Type': 'text/plain'
          });
        }
        resOrSocket.end('Unexpected error.');
      } else if (resOrSocket instanceof net.Socket) {
        resOrSocket.end();
      }
    });

    self.server.listen(self.listenPort, self.listenHost || '0.0.0.0', function () {
      if (self.server) {
        self.started = true;
      } else {
        // stop() got called while we were invoking listen! Close the server (we
        // still have the var server). The rest of the cleanup shouldn't be
        // necessary.
        server.close();
      }
      fut.isResolved() || fut['return']();
    });

    fut.wait();
  },

  // Idempotent.
  stop: function () {
    var self = this;

    if (! self.server)
      return;

    if (! self.started) {
      // This probably means that we failed to listen. However, there could be a
      // race condition and we could be in the middle of starting to listen! In
      // that case, the listen callback will notice that we nulled out server
      // here.
      self.server = null;
      return;
    }

    // This stops listening but allows existing connections to
    // complete gracefully.
    self.server.close();
    self.server = null;

    // It doesn't seem to be necessary to do anything special to
    // destroy an httpProxy proxyserver object.
    self.proxy = null;

    // Drop any held connections.
    _.each(self.httpQueue, function (c) {
      c.res.statusCode = 500;
      c.res.end();
    });
    self.httpQueue = [];

    _.each(self.websocketQueue, function (c) {
      c.socket.destroy();
    });
    self.websocketQueue = [];

    self.mode = "hold";
  },

  _tryHandleConnections: function () {
    var self = this;

    while (self.httpQueue.length) {
      if (self.mode !== "errorpage" && self.mode !== "proxy")
        break;

      var c = self.httpQueue.shift();
      if (self.mode === "errorpage") {
        showErrorPage(c.res);
      } else {
        self.proxy.web(c.req, c.res, {
          target: 'http://' + self.proxyToHost + ':' + self.proxyToPort
        });
      }
    }

    while (self.websocketQueue.length) {
      if (self.mode !== "proxy")
        break;

      var c = self.websocketQueue.shift();
      self.proxy.ws(c.req, c.socket, c.head, {
        target: 'http://' + self.proxyToHost + ':' + self.proxyToPort
      });
    }
  },

  // The proxy can be in one of three modes:
  // - "hold": hold connections until the mode changes
  // - "proxy": connections are proxied to the configured port
  // - "errorpage": an error page is served to HTTP connections, and
  //   websocket connections are held
  //
  // The initial mode is "hold".
  setMode: function (mode) {
    var self = this;
    self.mode = mode;
    self._tryHandleConnections();
  }
});

function showErrorPage(res) {
  // XXX serve an app that shows the logs nicely and that also
  // knows how to reload when the server comes back up
  res.writeHead(200, {'Content-Type': 'text/html'});
  res.write(`
<!DOCTYPE html>
<html>
  <head>
    <title>App crashing</title>
    <style type='text/css'>
      body { margin: 0; }
      h3 {
        margin: 0;
        font-family: sans-serif;
        padding: 20px 10px 10px 10px;
        background: #eee;
      }
      pre { margin: 20px; }
    </style>
  </head>

  <body>
    <h3>Your app is crashing. Here's the latest log:</h3>

    <pre>`);

      _.each(runLog.getLog(), function (item) {
        res.write(escapeEntities(item.message) + "\n");
      });

      res.write(`</pre>
  </body>
</html>`)

  res.end();
}

// Copied from packages/blaze/preamble.js
function escapeEntities(str) {
  const escapeMap = {
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#x27;",
    "`": "&#x60;", /* IE allows backtick-delimited attributes?? */
    "&": "&amp;"
  };

  const escapeChar = function(c) {
    return escapeMap[c];
  };

  return str.replace(/[&<>"'`]/g, escapeChar);
}

exports.Proxy = Proxy;
