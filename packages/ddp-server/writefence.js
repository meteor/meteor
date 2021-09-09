var Future = Npm.require('fibers/future');

// A write fence collects a group of writes, and provides a callback
// when all of the writes are fully committed and propagated (all
// observers have been notified of the write and acknowledged it.)
//
DDPServer._WriteFence = function () {
  var self = this;

  self.armed = false;
  self.fired = false;
  self.retired = false;
  self.outstanding_writes = 0;
  self.before_fire_callbacks = [];
  self.completion_callbacks = [];
};

// The current write fence. When there is a current write fence, code
// that writes to databases should register their writes with it using
// beginWrite().
//
DDPServer._CurrentWriteFence = new Meteor.EnvironmentVariable;

_.extend(DDPServer._WriteFence.prototype, {
  // Start tracking a write, and return an object to represent it. The
  // object has a single method, committed(). This method should be
  // called when the write is fully committed and propagated. You can
  // continue to add writes to the WriteFence up until it is triggered
  // (calls its callbacks because all writes have committed.)
  beginWrite: function () {
    var self = this;

    if (self.retired)
      return { committed: function () {} };

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
    if (self === DDPServer._CurrentWriteFence.get())
      throw Error("Can't arm the current fence");
    self.armed = true;
    self._maybeFire();
  },

  // Register a function to be called once before firing the fence.
  // Callback function can add new writes to the fence, in which case
  // it won't fire until those writes are done as well.
  onBeforeFire: function (func) {
    var self = this;
    if (self.fired)
      throw new Error("fence has already activated -- too late to " +
                      "add a callback");
    self.before_fire_callbacks.push(func);
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
      function invokeCallback (func) {
        try {
          func(self);
        } catch (err) {
          Meteor._debug("exception in write fence callback", err);
        }
      }

      self.outstanding_writes++;
      while (self.before_fire_callbacks.length > 0) {
        var callbacks = self.before_fire_callbacks;
        self.before_fire_callbacks = [];
        _.each(callbacks, invokeCallback);
      }
      self.outstanding_writes--;

      if (!self.outstanding_writes) {
        self.fired = true;
        var callbacks = self.completion_callbacks;
        self.completion_callbacks = [];
        _.each(callbacks, invokeCallback);
      }
    }
  },

  // Deactivate this fence so that adding more writes has no effect.
  // The fence must have already fired.
  retire: function () {
    var self = this;
    if (! self.fired)
      throw new Error("Can't retire a fence that hasn't fired.");
    self.retired = true;
  }
});
