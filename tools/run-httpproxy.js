// The HTTP proxy is primarily so we can use localhost:3000 with OAuth,
// on devices which don't run a webserver e.g. Android / iOS
// This is a generic HTTP proxy, like a mini-Squid
// (whereas run-proxy.js is just for our app)
var _ = require('underscore');
var Future = require('fibers/future');
var runLog = require('./run-log.js');
var url = require('url');

// options: listenPort, listenHost, onFailure
var HttpProxy = function (options) {
  var self = this;

  self.listenPort = options.listenPort;
  self.listenHost = options.listenHost;

  self.onFailure = options.onFailure || function () {};

  self.mode = "proxy";
  self.httpQueue = []; // keys: req, res
  self.websocketQueue = []; // keys: req, socket, head
  self.connectQueue = [];  // keys: req, socket, head

  self.proxy = null;
  self.server = null;
};

_.extend(HttpProxy.prototype, {
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
      agent: new http.Agent({ maxSockets: 1000 }),
      xfwd: false //true
    });

    var server = self.server = http.createServer(function (req, res) {
      // Normal HTTP request
      self.httpQueue.push({ req: req, res: res });
      self._tryHandleConnections();
    });

    self.server.on('connect', function (req, socket, head) {
      self.connectQueue.push({ req: req, socket: socket, head: head });
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
          "HTTP proxy server can't listen on port " + port + ". \n" +
          "If something else is using port " + port + ", you can\n" +
          "specify an alternative port with --http-proxy-port <port>.");
      } else if (self.listenHost &&
                 (err.code === 'ENOTFOUND' || err.code === 'EADDRNOTAVAIL')) {
        // This handles the case of "entered a DNS name that's unknown"
        // (ENOTFOUND from getaddrinfo) and "entered some random IP that we
        // can't bind to" (EADDRNOTAVAIL from listen).
        runLog.log(
          "Can't listen on host " + self.listenHost +
          " (" + err.code + " from " + err.syscall + ").");
      } else {
        runLog.log('' + err);
      }
      self.onFailure();
      // Allow start() to return.
      fut.isResolved() || fut['return']();
    });

    // Don't crash if the app doesn't respond; instead return an error
    // immediately.
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

    _.each(self.connectQueue, function (c) {
      c.socket.destroy();
    });
    self.connectQueue = [];

    self.mode = "hold";
  },

  _tryHandleConnections: function () {
    var self = this;

    while (self.httpQueue.length) {
      if (self.mode !== "proxy")
        break;

      var c = self.httpQueue.shift();
      var req = c.req;
      var targetUrl = req.url;
      runLog.log("Proxy request: " + req.method + " " +req.url);
      var newUrl = req.url
      self.proxy.web(c.req, c.res, {
        target: targetUrl
      });
    }

    while (self.websocketQueue.length) {
      if (self.mode !== "proxy")
        break;

      var c = self.websocketQueue.shift();
      var req = c.req;
      var targetUrl = req.url;
      runLog.log("Proxy request (websocket): " + req.method + " " +req.url);
      self.proxy.ws(c.req, c.socket, c.head, {
        target: targetUrl
      });
    }

    while (self.connectQueue.length) {
      if (self.mode !== "proxy")
        break;

      var c = self.connectQueue.shift();
      runLog.log("Proxy request (connect): " + c.req.method + " " + c.req.url);
      proxyConnectMethod(c.req, c.socket, c.head);
    }
  },

  // The proxy can be in one of three modes:
  // - "proxy": connections are proxied
  //
  // The initial mode is "proxy".
  setMode: function (mode) {
    var self = this;
    self.mode = mode;
    self._tryHandleConnections();
  }
});



// This is what http-proxy does
// XXX: We should submit connect support upstream
var setupSocket = function(socket) {
  socket.setTimeout(0);
  socket.setNoDelay(true);

  socket.setKeepAlive(true, 0);

  return socket;
};


var proxyConnectMethod = function (req, socket, options, head, server, clb) {
  if (req.method !== 'CONNECT') {
    socket.destroy();
    return true;
  }

  var tokens = req.url.split(':');

  if (tokens.length != 2) {
    runLog.log("Bad request: " + req.url);
    socket.destroy();
    return true;
  }

  var host = tokens[0];
  var port = tokens[1];

  if (port != 443) {
    runLog.log("Blocking request to non-443 port: " + req.url);
    socket.destroy();
    return true;
  }

  setupSocket(socket);

  // XXX: Needed?
  // if (head && head.length) socket.unshift(head);

  var net = require('net');
  var proxySocket = net.createConnection(port, host);
  setupSocket(proxySocket);

  socket.on('error', function (err) {
    runLog.log("Error on socket: " + err);
    proxySocket.end();
  });
  proxySocket.on('error', function (err) {
    runLog.log("Error on proxySocket: " + err);
    socket.end();
  });

  proxySocket.on('connect', function(connect) {
    runLog.log("Connection established to " + host + ":" + port);
    socket.write("HTTP/1.0 200 Connection established\n\n");
    socket.pipe(proxySocket);
    proxySocket.pipe(socket);
  });
};


exports.HttpProxy = HttpProxy;
