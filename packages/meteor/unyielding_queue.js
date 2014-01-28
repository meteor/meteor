// A simpler version of Meteor._SynchronousQueue with the same external
// interface. It runs on both client and server, unlike _SynchronousQueue which
// only runs on the server. When used on the server, tasks may not yield.  This
// one just runs all the tasks when you call runTask or flush, synchronously.
// It itself also does not yield.
//
Meteor._UnyieldingQueue = function () {
  var self = this;
  self._tasks = [];
  self._running = false;
};

_.extend(Meteor._UnyieldingQueue.prototype, {
  runTask: function (task) {
    var self = this;
    if (!self.safeToRunTask())
      throw new Error("Could not synchronously run a task from a running task");
    self._tasks.push(task);
    var tasks = self._tasks;
    self._tasks = [];
    self._running = true;
    try {
      while (!_.isEmpty(tasks)) {
        var t = tasks.shift();
        try {
          Meteor._noYieldsAllowed(function () {
            t();
          });
        } catch (e) {
          if (_.isEmpty(tasks)) {
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
    var wasEmpty = _.isEmpty(self._tasks);
    self._tasks.push(task);
    // Intentionally not using Meteor.setTimeout, because it doesn't like runing
    // in stubs for now.
    if (wasEmpty)
      setTimeout(_.bind(self.flush, self), 0);
  },

  flush: function () {
    var self = this;
    self.runTask(function () {});
  },

  drain: function () {
    var self = this;
    if (!self.safeToRunTask())
      return;
    while (!_.isEmpty(self._tasks)) {
      self.flush();
    }
  },

  safeToRunTask: function () {
    var self = this;
    return !self._running;
  }
});
