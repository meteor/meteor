var _ = require('underscore');
var Future = require('fibers/future');
var runLog = require('./run-log.js').runLog;

// options: listenPort, proxyToPort, onFailure
var Proxy = function (options) {
  var self = this;

  self.listenPort = options.listenPort;
  // note: run-all.js updates proxyToPort directly
  self.proxyToPort = options.proxyToPort;
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
      if (err.code == 'EADDRINUSE') {
        var port = self.listenPort;
        runLog.log(
"Can't listen on port " + port + ". Perhaps another Meteor is running?\n" +
"\n" +
"Running two copies of Meteor in the same application directory\n" +
"will not work. If something else is using port " + port + ", you can\n" +
"specify an alternative port with --port <port>.");
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
        resOrSocket.writeHead(503, {
          'Content-Type': 'text/plain'
        });
        resOrSocket.end('Unexpected error.');
      } else if (resOrSocket instanceof net.Socket) {
        resOrSocket.end();
      }
    });

    self.server.listen(self.listenPort, function () {
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
        // XXX serve an app that shows the logs nicely and that also
        // knows how to reload when the server comes back up
        c.res.writeHead(200, {'Content-Type': 'text/plain'});
        c.res.write("Your app is crashing. Here's the latest log.\n\n");

        _.each(runLog.getLog(), function (item) {
          c.res.write(item.message + "\n");
        });

        c.res.end();
      } else {
        self.proxy.web(c.req, c.res, {
          target: 'http://127.0.0.1:' + self.proxyToPort
        });
      }
    }

    while (self.websocketQueue.length) {
      if (self.mode !== "proxy")
        break;

      var c = self.websocketQueue.shift();
      self.proxy.ws(c.req, c.socket, c.head, {
        target: 'http://127.0.0.1:' + self.proxyToPort
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

exports.Proxy = Proxy;
