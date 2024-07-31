StubStream = function() {
  const self = this;

  self.sent = [];
  self.callbacks = Object.create(null);
};

Object.assign(StubStream.prototype, {
  // Methods from Stream
  on: function(name, callback) {
    const self = this;

    if (!self.callbacks[name]) self.callbacks[name] = [callback];
    else self.callbacks[name].push(callback);
  },

  send: function(data) {
    const self = this;
    self.sent.push(data);
  },

  status: function() {
    return { status: 'connected', fake: true };
  },

  reconnect: function() {
    // no-op
  },

  _lostConnection: function() {
    // no-op
  },

  // Methods for tests
  receive: function(data) {
    const self = this;

    if (typeof data === 'object') {
      data = EJSON.stringify(data);
    }

    _.each(self.callbacks['message'], function(cb) {
      cb(data);
    });
  },

  reset: function() {
    const self = this;
    _.each(self.callbacks['reset'], function(cb) {
      cb();
    });
  },

  // Provide a tag to detect stub streams.
  // We don't log heartbeat failures on stub streams, for example.
  _isStub: true
});
