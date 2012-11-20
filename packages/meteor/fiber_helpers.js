(function () {

var path = __meteor_bootstrap__.require('path');
var Fiber = __meteor_bootstrap__.require('fibers');
var Future = __meteor_bootstrap__.require(path.join('fibers', 'future'));

Meteor._noYieldsAllowed = function (f) {
  // "Fiber" and "yield" are both in the global namespace. The yield function is
  // at both "yield" and "Fiber.yield". (It's also at require('fibers').yield
  // but that is because require('fibers') === Fiber.)
  var savedYield = Fiber.yield;
  Fiber.yield = function () {
    throw new Error("Can't call yield in a noYieldsAllowed block!");
  };
  global.yield = Fiber.yield;
  try {
    return f();
  } finally {
    Fiber.yield = savedYield;
    global.yield = savedYield;
  }
};

// js2-mode AST blows up when parsing 'future.return()', so alias.
Future.prototype.ret = Future.prototype.return;

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
Meteor._SynchronousQueue = function () {
  var self = this;
  // List of tasks to run (not including a currently-running task if any). Each
  // is an object with field 'task' (the task function to run) and 'future' (the
  // Future associated with the blocking runTask call that queued it, or null if
  // called from queueTask).
  self._taskHandles = [];
  // This is true if self._run() is either currently executing or scheduled to
  // do so soon.
  self._runningOrRunScheduled = false;
  // During the execution of a task, this is set to the fiber used to execute
  // that task. We use this to throw an error rather than deadlocking if the
  // user calls runTask from within a task on the same fiber.
  self._currentTaskFiber = undefined;
};

_.extend(Meteor._SynchronousQueue.prototype, {
  runTask: function (task) {
    var self = this;

    if (!Fiber.current)
      throw new Error("Can only call runTask in a Fiber");
    if (self._currentTaskFiber === Fiber.current)
      throw new Error("Can't runTask from another task in the same fiber");

    var fut = new Future;
    self._taskHandles.push({task: task, future: fut});
    self._scheduleRun();
    // Yield. We'll get back here after the task is run (and will throw if the
    // task throws).
    fut.wait();
  },
  queueTask: function (task) {
    var self = this;
    self._taskHandles.push({task: task});
    self._scheduleRun();
    // No need to block.
  },
  taskRunning: function () {
    var self = this;
    return self._taskRunning;
  },
  _scheduleRun: function () {
    var self = this;

    // Already running or scheduled? Do nothing.
    if (self._runningOrRunScheduled)
      return;

    self._runningOrRunScheduled = true;

    process.nextTick(function () {
      Fiber(function () {
        self._run();
      }).run();
    });
  },
  _run: function () {
    var self = this;

    if (!self._runningOrRunScheduled)
      throw new Error("expected to be _runningOrRunScheduled");

    if (_.isEmpty(self._taskHandles)) {
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
        Meteor._debug("Exception in queued task: " + err);
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
        taskHandle.future.throw(exception);
      else
        taskHandle.future.ret();
    }
  }
});

})();
