var Fiber = Npm.require('fibers');
var Future = Npm.require('fibers/future');

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

var SQp = Meteor._SynchronousQueue.prototype;

const runTaskWithFibers = ({ task, self }) => {
  if (!self.safeToRunTask()) {
    if (Fiber.current) {
      throw new Error("Can't runTask from another task in the same fiber");
    } else {
      throw new Error('Can only call runTask in a Fiber');
    }
  }

  const fut = new Future();
  const handle = {
    task: Meteor.bindEnvironment(task, function(e) {
      Meteor._debug('Exception from task', e);
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
};

const runTask = ({ task, self }) => {
  const handle = {
    task: Meteor.bindEnvironment(task, function(e) {
      Meteor._debug('Exception from task', e);
      throw e;
    }),
    name: task.name,
  };

  self._taskHandles.push(handle);
  self._scheduleRun();
};

SQp.runTask = function(task) {
  const self = this;
  if (Meteor._isFibersEnabled) {
    runTaskWithFibers({ task, self });
    return;
  }
  runTask({ task, self });
};

SQp.queueTask = function (task) {
  var self = this;
  self._taskHandles.push({
    task: task,
    name: task.name
  });
  self._scheduleRun();
  // No need to block.
};

SQp.flush = function () {
  var self = this;
  self.runTask(function () {});
};

SQp.safeToRunTask = function () {
  var self = this;
  return Fiber.current && self._currentTaskFiber !== Fiber.current;
};

SQp.drain = function () {
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
};

SQp._scheduleRun = function () {
  var self = this;
  // Already running or scheduled? Do nothing.
  if (self._runningOrRunScheduled)
    return;

  self._runningOrRunScheduled = true;

  /**
   * FIXME:
   *  Here seems like we should defer and also yield while the handler is not
   *  finished...
   *  For autoupdate, for example, swapping to just running it sync won't make a difference,
   *  but maybe there is another place that would? (DDP/Web)-Server?
   */
  if (Meteor._isFibersEnabled) {
    setImmediate(function() {
      Fiber(function() {
        self._run();
      }).run();
    });
  } else {
    global.asyncLocalStorage.run(Meteor._getAslStore(), () => {
      self._run();
    });
  }
};

SQp._run = function () {
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

  var exception = undefined;
  function runFiber() {
    self._currentTaskFiber = Fiber.current;
    try {
      taskHandle.task();
    } catch (err) {
      if (taskHandle.future) {
        // We'll throw this exception through runTask.
        exception = err;
      } else {
        Meteor._debug("Exception in queued task", err);
      }
    }
    self._currentTaskFiber = undefined;
  }
  // Run the task.
  if (Meteor._isFibersEnabled) {
    runFiber();
  } else {
    try {
      taskHandle.task();
    } catch (err) {
        Meteor._debug("Exception in queued task", err);
    }
  }

  // Soon, run the next task, if there is any.
  self._runningOrRunScheduled = false;
  self._scheduleRun();

  if (Meteor._isFibersEnabled) {
    // If this was queued with runTask, let the runTask call return (throwing if
    // the task threw).
    if (taskHandle.future) {
      if (exception)
        taskHandle.future['throw'](exception);
      else
        taskHandle.future['return']();
    }
  }
};

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
