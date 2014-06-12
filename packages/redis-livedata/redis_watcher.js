var path = Npm.require('path');
var Future = Npm.require(path.join('fibers', 'future'));

RedisWatcher = function (url) {
  var self = this;
  self._url = url;

  self._watchConnection = null;
  self._stopped = false;
  self._readyFuture = new Future();
  self._listeners = [];
  self._start();
};

_.extend(RedisWatcher.prototype, {
  stop: function () {
    var self = this;
    if (self._stopped)
      return;
    self._stopped = true;
    // XXX should close connections too
  },
  addListener: function (listener) {
    var self = this;
    self._listeners.push(listener);
  },
  removeListener: function (listener) {
    var self = this;
    self._listeners = _.without(self._listeners, listener);
  },
  _start: function () {
    var self = this;
    self._watchConnection = new RedisClient(self._url);

    var listener = function (key, message) {
      _.each(self._listeners, function (listener) {
        listener(key, message);
      });
    };
    
    self._watchConnection.subscribeKeyspaceEvents(function (err, results) {
      if (err != null) {
        Meteor._debug("Error subscribing to redis changes: " + JSON.stringify(err));
        self._readyFuture.throw(new Error("Error subscribing to redis changes"));
      } else {
        self._readyFuture.return();
      }
    }, listener);
  }
});