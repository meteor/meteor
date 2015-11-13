var Future = require("fibers/future");
var _ = require("underscore");
var isopackets = require('../tool-env/isopackets.js');
var files = require('../fs/files.js');

// Wrapper to manage a connection to a DDP service. The main difference between
// it and a raw DDP connection is that the constructor blocks until a successful
// connection is made; you can't call methods or subscribe asynchronously (ie,
// there's always a wait); and if the connection disconnects (with or without
// error) while we're waiting on a method call or subscription, the
// apply/subscribeAndWait call throws the given error. This functionality should
// eventually end up in the DDP client in one form or another.
//
// ServiceConnections never reconnect once they have successfully negotiated the
// DDP protocol: other than perhaps some initial attempts with the wrong
// protocol selected, they use just one underlying TCP connection, and fail
// fast.
//
// - endpointUrl: the url to connect to
// - options:
//   - headers: an object containing extra headers to use when opening the
//              DDP connection
//   - _dontPrintErrors: boolean
//   ...and anything else you'd normally pass as options to DDP.connect
//
var ServiceConnection = function (endpointUrl, options) {
  var self = this;

  var Package = isopackets.load('ddp');

  // ServiceConnection never should retry connections: just one TCP connection
  // is enough, and any errors on it should be detected promptly.
  options = _.extend({}, options, {
    // We found that this was likely to time out with the DDP default of 10s,
    // especially if the CPU is churning on bundling (eg, for the stats
    // connection which we start in parallel with bundling).
    connectTimeoutMs: 30000,
    // Disable client->server heartbeats for service connections.  Users with
    // slow internet connections were seeing heartbeat timeouts because the
    // heartbeats were buried behind large responses (eg
    // https://github.com/meteor/meteor/issues/2777).
    heartbeatInterval: 0,
    retry: false,
    onConnected: function () {
      self.connected = true;
      if (!self.currentFuture) {
        throw Error("nobody waiting for connection?");
      }
      if (self.currentFuture !== connectFuture) {
        throw Error("waiting for something that isn't connection?");
      }
      self.currentFuture = null;
      connectFuture.return();
    }
  });
  if (process.env.CAFILE) {
    options.npmFayeOptions = {
      ca: files.readFile(process.env.CAFILE)
    }
  }

  self.connection = Package['ddp-client'].DDP.connect(endpointUrl, options);

  // Wait until we have some sort of initial connection or error (including the
  // 10-second timeout built into our DDP client).
  var connectFuture = self.currentFuture = new Future;
  self.connection._stream.on('disconnect', function (error) {
    self.connected = false;
    if (error && error.errorType === "DDP.ForcedReconnectError") {
      // OK, we requested this, probably due to version negotation failure.
      //
      // This ought to have happened before we successfully connect, unless
      // somebody adds other calls to forced reconnect to Meteor...
      if (connectFuture.isResolved()) {
        throw Error("disconnect before connect?");
      }
      // Otherwise, ignore this error. We're going to reconnect!
      return;
    }
    // Are we waiting to connect or for the result of a method apply or a
    // subscribeAndWait? If so, disconnecting is a problem.
    if (self.currentFuture) {
      var fut = self.currentFuture;
      self.currentFuture = null;
      fut.throw(error ||
                new Package['ddp-client'].DDP.ConnectionError(
                  "DDP disconnected while connection in progress"));
    } else if (error) {
      // We got some sort of error with nobody listening for it; handle it.
      // XXX probably have a better way to handle it than this
      throw error;
    }
  });
  connectFuture.wait();
};

_.extend(ServiceConnection.prototype, {
  call: function (name, ...args) {
    return this.apply(name, args);
  },

  apply: function (...args) {
    var self = this;

    if (self.currentFuture) {
      throw Error("Can't wait on two things at once!");
    }
    self.currentFuture = new Future;

    args.push(function (err, result) {
      if (!self.currentFuture) {
        // We're not still waiting? That means we had a disconnect event. But
        // then how did we actually get this result?
        throw Error("nobody listening for result?");
      }
      var fut = self.currentFuture;
      self.currentFuture = null;
      fut.resolver()(err, result);  // throw or return
    });

    self.connection.apply(...args);

    return self.currentFuture.wait();
  },

  // XXX derived from _subscribeAndWait in ddp_connection.js
  // -- but with a different signature..
  subscribeAndWait: function (...args) {
    var self = this;

    if (self.currentFuture) {
      throw Error("Can't wait on two things at once!");
    }
    var subFuture = self.currentFuture = new Future;

    args.push({
      onReady: function () {
        if (!self.currentFuture) {
          // We're not still waiting? That means we had a disconnect event. But
          // then how did we actually get this result?
          throw Error("nobody listening for subscribe result?");
        }
        var fut = self.currentFuture;
        self.currentFuture = null;
        fut.return();
      },
      onError: function (e) {
        if (self.currentFuture === subFuture) {
          // Error while waiting for this sub to become ready? Throw it.
          self.currentFuture = null;
          subFuture.throw(e);
        }
        // ... ok, this is a late error on the sub.
        // XXX handle it somehow better
        throw e;
      }
    });

    var sub = self.connection.subscribe(...args);
    subFuture.wait();
    return sub;
  },

  close: function () {
    var self = this;
    if (self.connection) {
      self.connection.close();
      self.connection = null;
    }
  }
});

module.exports = ServiceConnection;
