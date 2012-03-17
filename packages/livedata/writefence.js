// A write fence collects a group of writes, and provides a callback
// when all of the writes are fully committed and propagated (all
// observers have been notified of the write and acknowledged it.)
Meteor._WriteFence = function () {
  var self = this;

  self.armed = false;
  self.fired = false;
  self.outstanding_writes = 0;
  self.completion_callbacks = [];
};

// The current write fence. When there is a current write fence, code
// that writes to databases should register their writes with it using
// beginWrite().
Meteor._CurrentWriteFence = new Meteor.EnvironmentVariable;

_.extend(Meteor._WriteFence.prototype, {
  // Start tracking a write, and return an object to represent it. The
  // object has a single method, committed(). This method should be
  // called when the write is fully committed and propagated. You can
  // continue to add writes to the WriteFence up until it is triggered
  // (calls its callbacks because all writes have committed.)
  beginWrite: function () {
    var self = this;

    if (self.fired)
      throw new Error("fence has already activated -- too late to add writes");

    self.outstanding_writes++;
    var committed = false;
    return {
      committed: function () {
        if (committed)
          throw new Error("committed called twice on the same write");
        committed = true;
        self.outstanding_writes--;
        self._maybeFire();
      }
    };
  },

  // Arm the fence. Once the fence is armed, and there are no more
  // uncommitted writes, it will activate.
  arm: function () {
    var self = this;
    self.armed = true;
    self._maybeFire();
  },

  // Register a function to be called when the fence fires.
  onAllCommitted: function (func) {
    var self = this;
    if (self.fired)
      throw new Error("fence has already activated -- too late to " +
                      "add a callback");
    self.completion_callbacks.push(func);
  },

  // Convenience function. Arms the fence, then blocks until it fires.
  armAndWait: function () {
    var self = this;
    var future = new Future;
    self.onAllCommitted(function () {
      future['return']();
    });
    self.arm();
    future.wait();
  },

  _maybeFire: function () {
    var self = this;
    if (self.fired)
      throw new Error("write fence already activated?");
    if (self.armed && !self.outstanding_writes) {
      self.fired = true;
      _.each(self.completion_callbacks, function (f) {f(self);});
      self.completion_callbacks = [];
    }
  }
});