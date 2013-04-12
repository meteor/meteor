// This file is a partial analogue to fiber_helpers.js, which allows the client
// to use a queue too, and also to call noYieldsAllowed.

// The client has no ability to yield, so noYieldsAllowed is a noop.
Meteor._noYieldsAllowed = function (f) {
  return f();
};

// An even simpler queue of tasks than the fiber-enabled one.  This one just
// runs all the tasks when you call runTask or flush, synchronously.
Meteor._SynchronousQueue = function () {
  var self = this;
  self._tasks = [];
  self._running = false;
};

_.extend(Meteor._SynchronousQueue.prototype, {
  runTask: function (task) {
    var self = this;
    self._tasks.push(task);
    self._running = true;
    try {
      while (!_.isEmpty(self._tasks)) {
        var t = self._tasks.shift();
        try {
          t();
        } catch (e) {
          if (_.isEmpty(self._tasks)) {
            // this was the last task, that is, the one we're calling runTask
            // for.
            throw e;
          } else {
            Meteor._debug("Exception in queued task: " + e.stack);
          }
        }
      }
    } finally {
      self._running = false;
    }
  },

  queueTask: function (task) {
    var self = this;
    self._tasks.push(task);
  },

  flush: function () {
    var self = this;
    self.runTask(function () {});
  },

  taskRunning: function () {
    var self = this;
    return self._running;
  },

  safeToRunTask: function () {
    return true;
  }
});
