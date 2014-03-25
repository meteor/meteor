var Future = require("fibers/future");
var _ = require("underscore");

// Wrapper to manage a connection to a DDP service. Provides failing
// method calls and subscriptions if, after 10 seconds, we're not
// connected. This functionality should eventually end up in the DDP
// client in one form or another.
//
// - Package: a Package object as returned from uniload.load, containing
//   the livedata and meteor packages
// - endpointUrl: the url to connect to
// - headers: an object containing extra headers to use when opening the
//   DDP connection
var ServiceConnection = function (Package, endpointUrl, headers) {
  var self = this;
  self.Package = Package;

  var options = {};
  if (headers) {
    options.headers = headers;
  }
  self.connection = Package.livedata.DDP.connect(endpointUrl, options);

  self.connectionTimeoutCallbacks = [];
  self.connectionTimer = Package.meteor.Meteor.setTimeout(function () {
    if (self.connection.status().status !== "connected") {
      self.connection = null;
      _.each(self.connectionTimeoutCallbacks, function (f) {
        f();
      });
      self.connectionTimeoutCallbacks = [];
    }
  }, 10*1000);
};

_.extend(ServiceConnection.prototype, {
  _onConnectionTimeout: function (f) {
    var self = this;
    if (! self.connection)
      f();
    else
      self.connectionTimeoutCallbacks.push(f);
  },

  call: function (/* arguments */) {
    var self = this;
    var fut = new Future;
    self._onConnectionTimeout(function () {
      fut['throw'](new ServiceConnection.ConnectionTimeoutError);
    });

    var args = _.toArray(arguments);
    var name = args.shift();
    self.connection.apply(name, args, function (err, result) {
      if (err) {
        fut['throw'](err);
      } else {
        self._cleanUpTimer();
        fut['return'](result);
      }
    });

    return fut.wait();
  },

  // XXX derived from _subscribeAndWait in livedata_connection.js
  // -- but with a different signature..
  subscribeAndWait: function (/* arguments */) {
    var self = this;

    var fut = new Future();
    self._onConnectionTimeout(function () {
      fut['throw'](new ServiceConnection.ConnectionTimeoutError);
    });

    var ready = false;
    var args = _.toArray(arguments);
    args.push({
      onReady: function () {
        ready = true;
        self._cleanUpTimer();
        fut['return']();
      },
      onError: function (e) {
        if (! ready)
          fut['throw'](e);
        else
          /* XXX handle post-ready error */;
      }
    });

    var sub = self.connection.subscribe.apply(self.connection, args);
    fut.wait();
    return sub;
  },

  _cleanUpTimer: function () {
    var self = this;
    var Package = self.Package;
    Package.meteor.Meteor.clearTimeout(self.connectionTimer);
    self.connectionTimer = null;
  },

  close: function () {
    var self = this;
    if (self.connection) {
      self.connection.close();
      self.connection = null;
    }
    if (self.connectionTimer) {
      // Clean up the timer so that Node can exit cleanly
      self._cleanUpTimer();
    }
  }
});

ServiceConnection.ConnectionTimeoutError = function () {};

module.exports = ServiceConnection;
