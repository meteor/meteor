var path = Npm.require('path');
var Fiber = Npm.require('fibers');
var Future = Npm.require(path.join('fibers', 'future'));

Meteor._noYieldsAllowed = function (f) {
  var savedYield = Fiber.yield;
  Fiber.yield = function () {
    throw new Error("Can't call yield in a noYieldsAllowed block!");
  };
  try {
    return f();
  } finally {
    Fiber.yield = savedYield;
  }
};

Meteor._DoubleEndedQueue = Npm.require('double-ended-queue');

// Meteor._SynchronousQueue is a queue which runs task functions serially.
// Tasks are assumed to be synchronous: ie, it's assumed that they are
// done when they return.
//
// It has two methods:
//   - queueTask queues a task to be run, and returns immediately.
//   - runTask queues a task to be run, and then yields. It returns
//     when the task finishes running.
//
// It's safe to call queueTask from within a task, but not runTask (unless
// you're calling runTask from a nested Fiber).
//
// Somewhat inspired by async.queue, but specific to blocking tasks.
// XXX break this out into an NPM module?
// XXX could maybe use the npm 'schlock' module instead, which would
//     also support multiple concurrent "read" tasks
//
Meteor._SynchronousQueue = function () {
  var self = this;
  // List of tasks to run (not including a currently-running task if any). Each
  // is an object with field 'task' (the task function to run) and 'future' (the
  // Future associated with the blocking runTask call that queued it, or null if
  // called from queueTask).
  self._taskHandles = new Meteor._DoubleEndedQueue();
  // This is true if self._run() is either currently executing or scheduled to
  // do so soon.
  self._runningOrRunScheduled = false;
  // During the execution of a task, this is set to the fiber used to execute
  // that task. We use this to throw an error rather than deadlocking if the
  // user calls runTask from within a task on the same fiber.
  self._currentTaskFiber = undefined;
  // This is true if we're currently draining.  While we're draining, a further
  // drain is a noop, to prevent infinite loops.  "drain" is a heuristic type
  // operation, that has a meaning like unto "what a naive person would expect
  // when modifying a table from an observe"
  self._draining = false;
};

_.extend(Meteor._SynchronousQueue.prototype, {
  runTask: function (task) {
    var self = this;

    if (!self.safeToRunTask()) {
      if (Fiber.current)
        throw new Error("Can't runTask from another task in the same fiber");
      else
        throw new Error("Can only call runTask in a Fiber");
    }

    var fut = new Future;
    var handle = {
      task: Meteor.bindEnvironment(task, function (e) {
        Meteor._debug("Exception from task:", e && e.stack || e);
        throw e;
      }),
      future: fut,
      name: task.name
    };
    self._taskHandles.push(handle);
    self._scheduleRun();
    // Yield. We'll get back here after the task is run (and will throw if the
    // task throws).
    fut.wait();
  },
  queueTask: function (task) {
    var self = this;
    self._taskHandles.push({
      task: task,
      name: task.name
    });
    self._scheduleRun();
    // No need to block.
  },

  flush: function () {
    var self = this;
    self.runTask(function () {});
  },

  safeToRunTask: function () {
    var self = this;
    return Fiber.current && self._currentTaskFiber !== Fiber.current;
  },

  drain: function () {
    var self = this;
    if (self._draining)
      return;
    if (!self.safeToRunTask())
      return;
    self._draining = true;
    while (! self._taskHandles.isEmpty()) {
      self.flush();
    }
    self._draining = false;
  },

  _scheduleRun: function () {
    var self = this;
    // Already running or scheduled? Do nothing.
    if (self._runningOrRunScheduled)
      return;

    self._runningOrRunScheduled = true;
    setImmediate(function () {
      Fiber(function () {
        self._run();
      }).run();
    });
  },
  _run: function () {
    var self = this;

    if (!self._runningOrRunScheduled)
      throw new Error("expected to be _runningOrRunScheduled");

    if (self._taskHandles.isEmpty()) {
      // Done running tasks! Don't immediately schedule another run, but
      // allow future tasks to do so.
      self._runningOrRunScheduled = false;
      return;
    }
    var taskHandle = self._taskHandles.shift();

    // Run the task.
    self._currentTaskFiber = Fiber.current;
    var exception = undefined;
    try {
      taskHandle.task();
    } catch (err) {
      if (taskHandle.future) {
        // We'll throw this exception through runTask.
        exception = err;
      } else {
        Meteor._debug("Exception in queued task: " + err.stack);
      }
    }
    self._currentTaskFiber = undefined;

    // Soon, run the next task, if there is any.
    self._runningOrRunScheduled = false;
    self._scheduleRun();

    // If this was queued with runTask, let the runTask call return (throwing if
    // the task threw).
    if (taskHandle.future) {
      if (exception)
        taskHandle.future['throw'](exception);
      else
        taskHandle.future['return']();
    }
  }
});

// Sleep. Mostly used for debugging (eg, inserting latency into server
// methods).
//
Meteor._sleepForMs = function (ms) {
  var fiber = Fiber.current;
  setTimeout(function() {
    fiber.run();
  }, ms);
  Fiber.yield();
};
