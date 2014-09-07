StubStream = function () {
  var self = this;

  self.sent = [];
  self.callbacks = {};
};


_.extend(StubStream.prototype, {
  // Methods from Stream
  on: function (name, callback) {
    var self = this;

    if (!self.callbacks[name])
      self.callbacks[name] = [callback];
    else
      self.callbacks[name].push(callback);
  },

  send: function (data) {
    var self = this;
    self.sent.push(data);
  },

  status: function () {
    return {status: "connected", fake: true};
  },

  reconnect: function () {
    // no-op
  },

  _lostConnection: function () {
    // no-op
  },

  // Methods for tests
  receive: function (data) {
    var self = this;

    if (typeof data === 'object') {
      data = EJSON.stringify(data);
    }

    _.each(self.callbacks['message'], function (cb) {
      cb(data);
    });
  },

  reset: function () {
    var self = this;
    _.each(self.callbacks['reset'], function (cb) {
      cb();
    });
  },

  // Provide a tag to detect stub streams.
  // We don't log heartbeat failures on stub streams, for example.
  _isStub: true
});
