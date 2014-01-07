var _ = require('underscore');
var Future = require('fibers/future');

// options: listenPort, proxyToPort, onFailure, runLog
var Proxy = function (options) {
  var self = this;

  self.listenPort = options.listenPort;
  self.proxyToPort = options.proxyToPort;
  self.onFailure = options.onFailure || function () {};
  self.runLog = options.runLog;

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

    var http = require('http');
    // Note: this uses the pre-release 1.0.0 API.
    var httpProxy = require('http-proxy');

    self.proxy = httpProxy.createProxyServer({
      // agent is required to handle keep-alive, and http-proxy 1.0 is a little
      // buggy without it: https://github.com/nodejitsu/node-http-proxy/pull/488
      agent: new http.Agent({ maxSockets: 100 }),
      xfwd: true
    });

    self.server = http.createServer(function (req, res) {
      // Normal HTTP request
      self.httpQueue.push({ req: req, res: res });
      self._tryHandleConnections();
    });

    self.server.on('upgrade', function (req, socket, head) {
      // Websocket connection
      self.websocketQueue.push({ req: req, socket: socket, head: head });
      self._tryHandleConnections();
    });

    self.server.on('error', function (err) {
      if (err.code == 'EADDRINUSE') {
        var port = self.listenPort;
        self.runLog.log(
"Can't listen on port " + port + ". Perhaps another Meteor is running?\n" +
"\n" +
"Running two copies of Meteor in the same application directory\n" +
"will not work. If something else is using port " + port + ", you can\n" +
"specify an alternative port with --port <port>.");
      } else {
        self.runLog.log('' + err);
      }
      self.onFailure();
    });

    // don't crash if the app doesn't respond. instead return an error
    // immediately. This shouldn't happen much since we try to not
    // send requests if the app is down.
    self.proxy.ee.on('http-proxy:outgoing:web:error', function (err, req, res) {
      res.writeHead(503, {
        'Content-Type': 'text/plain'
      });
      res.end('Unexpected error.');
    });
    self.proxy.ee.on('http-proxy:outgoing:ws:error', function (err, req,socket){
      socket.end();
    });

    var fut = new Future;
    self.server.listen(self.listenPort, function () {
      fut['return']();
    });

    fut.wait();
  },

  // Idempotent.
  stop: function () {
    var self = this;

    if (! self.server)
      return;

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

        _.each(self.runLog.getLog(), function (item) {
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