// @param endpoint {String} URL to Meteor app
//   "http://subdomain.meteor.com/" or "/" or
//   "ddp+sockjs://foo-**.meteor.com/sockjs"
//
// We do some rewriting of the URL to eventually make it "ws://" or "wss://",
// whatever was passed in.  At the very least, what Meteor.absoluteUrl() returns
// us should work.
//
// We don't do any heartbeating. (The logic that did this in sockjs was removed,
// because it used a built-in sockjs mechanism. We could do it with WebSocket
// ping frames or with DDP-level messages.)
LivedataTest.ClientStream = function (endpoint, options) {
  var self = this;
  options = options || {};

  self.options = _.extend({
    retry: true
  }, options);

  self.client = null;  // created in _launchConnection
  self.endpoint = endpoint;

  self.headers = self.options.headers || {};

  self._initCommon(self.options);

  //// Kickoff!
  self._launchConnection();
};

_.extend(LivedataTest.ClientStream.prototype, {

  // data is a utf8 string. Data sent while not connected is dropped on
  // the floor, and it is up the user of this API to retransmit lost
  // messages on 'reset'
  send: function (data) {
    var self = this;
    if (self.currentStatus.connected) {
      self.client.messages.write(data);
    }
  },

  // Changes where this connection points
  _changeUrl: function (url) {
    var self = this;
    self.endpoint = url;
  },

  _onConnect: function (client) {
    var self = this;

    if (client !== self.client) {
      // This connection is not from the last call to _launchConnection.
      // But _launchConnection calls _cleanup which closes previous connections.
      // It's our belief that this stifles future 'open' events, but maybe
      // we are wrong?
      throw new Error("Got open from inactive client " + !!self.client);
    }

    if (self._forcedToDisconnect) {
      // We were asked to disconnect between trying to open the connection and
      // actually opening it. Let's just pretend this never happened.
      self.client.close();
      self.client = null;
      return;
    }

    if (self.currentStatus.connected) {
      // We already have a connection. It must have been the case that we
      // started two parallel connection attempts (because we wanted to
      // 'reconnect now' on a hanging connection and we had no way to cancel the
      // connection attempt.) But this shouldn't happen (similarly to the client
      // !== self.client check above).
      throw new Error("Two parallel connections?");
    }

    self._clearConnectionTimer();

    // update status
    self.currentStatus.status = "connected";
    self.currentStatus.connected = true;
    self.currentStatus.retryCount = 0;
    self.statusChanged();

    // fire resets. This must come after status change so that clients
    // can call send from within a reset callback.
    _.each(self.eventCallbacks.reset, function (callback) { callback(); });
  },

  _cleanup: function (maybeError) {
    var self = this;

    self._clearConnectionTimer();
    if (self.client) {
      var client = self.client;
      self.client = null;
      client.close();

      _.each(self.eventCallbacks.disconnect, function (callback) {
        callback(maybeError);
      });
    }
  },

  _clearConnectionTimer: function () {
    var self = this;

    if (self.connectionTimer) {
      clearTimeout(self.connectionTimer);
      self.connectionTimer = null;
    }
  },

  _launchConnection: function () {
    var self = this;
    self._cleanup(); // cleanup the old socket, if there was one.

    // Since server-to-server DDP is still an experimental feature, we only
    // require the module if we actually create a server-to-server
    // connection.
    var websocketDriver = Npm.require('websocket-driver');

    // We would like to specify 'ddp' as the subprotocol here. The npm module we
    // used to use as a client would fail the handshake if we ask for a
    // subprotocol and the server doesn't send one back (and sockjs doesn't).
    // Faye doesn't have that behavior; it's unclear from reading RFC 6455 if
    // Faye is erroneous or not.  So for now, we don't specify protocols.
    var wsUrl = toWebsocketUrl(self.endpoint);
    var client = self.client = websocketDriver.client(wsUrl);

    self._clearConnectionTimer();
    self.connectionTimer = Meteor.setTimeout(
      function () {
        self._lostConnection(
          new DDP.ConnectionError("DDP connection timed out"));
      },
      self.CONNECT_TIMEOUT);

    var onConnect = function () {
      client.start();
    };
    var stream = self._createSocket(wsUrl, onConnect);

    if (!self.client) {
      // We hit a connection timeout or other issue while yielding in
      // _createSocket. Drop the connection.
      stream.end();
      return;
    }

    _.each(self.headers, function (header, name) {
      client.setHeader(name, header);
    });

    self.client.on('open', Meteor.bindEnvironment(function () {
      return self._onConnect(client);
    }, "stream connect callback"));

    var clientOnIfCurrent = function (event, description, f) {
      self.client.on(event, Meteor.bindEnvironment(function () {
        // Ignore events from any connection we've already cleaned up.
        if (client !== self.client)
          return;
        f.apply(this, arguments);
      }, description));
    };

    var finalize = Meteor.bindEnvironment(function () {
      stream.end();
      if (client === self.client) {
        self._lostConnection();
      }
    }, "finalizing stream");

    stream.on('end', finalize);
    stream.on('close', finalize);
    client.on('close', finalize);

    var onError = function (message) {
      if (!self.options._dontPrintErrors)
        Meteor._debug("driver error", message);

      // Faye's 'error' object is not a JS error (and among other things,
      // doesn't stringify well). Convert it to one.
      self._lostConnection(new DDP.ConnectionError(message));
    };

    clientOnIfCurrent('error', 'driver error callback', function (error) {
      onError(error.message);
    });

    stream.on('error', Meteor.bindEnvironment(function (error) {
      if (client === self.client) {
        onError('Network error: ' + wsUrl + ': ' + error.message);
      }
      stream.end();
    }));

    clientOnIfCurrent('message', 'stream message callback', function (message) {
      // Ignore binary frames, where data is a Buffer
      if (typeof message.data !== "string")
        return;
      _.each(self.eventCallbacks.message, function (callback) {
        callback(message.data);
      });
    });

    stream.pipe(self.client.io);
    self.client.io.pipe(stream);
  },

  _createSocket: function (wsUrl, onConnect) {
    var self = this;
    var urlModule = Npm.require('url');
    var parsedTargetUrl = urlModule.parse(wsUrl);
    var targetUrlPort = +parsedTargetUrl.port;
    if (!targetUrlPort) {
      targetUrlPort = parsedTargetUrl.protocol === 'wss:' ? 443 : 80;
    }

    // Corporate proxy tunneling support.
    var proxyUrl = self._getProxyUrl(parsedTargetUrl.protocol);
    if (proxyUrl) {
      var targetProtocol =
            (parsedTargetUrl.protocol === 'wss:' ? 'https' : 'http');
      var parsedProxyUrl = urlModule.parse(proxyUrl);
      var proxyProtocol =
            (parsedProxyUrl.protocol === 'https:' ? 'Https' : 'Http');
      var proxyUrlPort = +parsedProxyUrl.port;
      if (!proxyUrlPort) {
        proxyUrlPort = parsedProxyUrl.protocol === 'https:' ? 443 : 80;
      }
      var tunnelFnName = targetProtocol + 'Over' + proxyProtocol;
      var tunnelAgent = Npm.require('tunnel-agent');
      var proxyOptions = {
        host: parsedProxyUrl.hostname,
        port: proxyUrlPort,
        headers: {
          host: parsedTargetUrl.host + ':' + targetUrlPort
        }
      };
      if (parsedProxyUrl.auth) {
        proxyOptions.proxyAuth = Npm.require('querystring').unescape(
          parsedProxyUrl.auth);
      }
      var tunneler = tunnelAgent[tunnelFnName]({proxy: proxyOptions});
      var events = Npm.require('events');
      var fakeRequest = new events.EventEmitter();
      var Future = Npm.require('fibers/future');
      var fut = new Future;
      fakeRequest.on('error', function (e) {
        fut.isResolved() || fut.throw(e);
      });
      tunneler.createSocket({
        host: parsedTargetUrl.host,
        port: targetUrlPort,
        request: fakeRequest
      }, function (socket) {
        socket.on('close', function () {
          tunneler.removeSocket(socket);
        });
        process.nextTick(onConnect);
        fut.return(socket);
      });
      return fut.wait();
    }

    if (parsedTargetUrl.protocol === 'wss:') {
      return Npm.require('tls').connect(
        targetUrlPort, parsedTargetUrl.hostname, onConnect);
    } else {
      var stream = Npm.require('net').createConnection(
        targetUrlPort, parsedTargetUrl.hostname);
      stream.on('connect', onConnect);
      return stream;
    }
  },

  _getProxyUrl: function (protocol) {
    var self = this;
    // Similar to code in tools/http-helpers.js.
    var proxy = process.env.HTTP_PROXY || process.env.http_proxy || null;
    // if we're going to a secure url, try the https_proxy env variable first.
    if (protocol === 'wss:') {
      proxy = process.env.HTTPS_PROXY || process.env.https_proxy || proxy;
    }
    return proxy;
  }
});
