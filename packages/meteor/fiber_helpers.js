var Fiber = Npm.require('fibers');
var Future = Npm.require('fibers/future');

Meteor._noYieldsAllowed = function (f) {
  if (!Meteor._isFibersEnabled) {
    return f();
  }

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
class AsynchronousQueue {
  constructor() {
    this._taskHandles = new Meteor._DoubleEndedQueue();
    this._runningOrRunScheduled = false;
    // This is true if we're currently draining.  While we're draining, a further
    // drain is a noop, to prevent infinite loops.  "drain" is a heuristic type
    // operation, that has a meaning like unto "what a naive person would expect
    // when modifying a table from an observe"
    this._draining = false;
  }

  queueTask(task) {
    this._taskHandles.push({
      task: task,
      name: task.name
    });
    return this._scheduleRun();
  }

  _scheduleRun() {
    // Already running or scheduled? Do nothing.
    if (this._runningOrRunScheduled)
      return;

    this._runningOrRunScheduled = true;

    let resolver;
    const returnValue = new Promise(r => resolver = r);
    setImmediate(async () => {
      await this._run();

      if (!resolver) {
        throw new Error("Resolver not found for task");
      }

      resolver();
    });

    return returnValue;
  }

  async _run() {
    if (!this._runningOrRunScheduled)
      throw new Error("expected to be _runningOrRunScheduled");

    if (this._taskHandles.isEmpty()) {
      // Done running tasks! Don't immediately schedule another run, but
      // allow future tasks to do so.
      this._runningOrRunScheduled = false;
      return;
    }
    const taskHandle = this._taskHandles.shift();

    // Run the task.
    try {
      await taskHandle.task();
    } catch (err) {
        Meteor._debug("Exception in queued task", err);
    }

    // Soon, run the next task, if there is any.
    this._runningOrRunScheduled = false;
    this._scheduleRun();
  }

  runTask(task) {
    const handle = {
      task: Meteor.bindEnvironment(task, function(e) {
        Meteor._debug('Exception from task', e);
        throw e;
      }),
      name: task.name
    };
    this._taskHandles.push(handle);
    return this._scheduleRun();
  }

  async flush() {
    await this.runTask(() => {});
  }

  drain() {
    if (this._draining)
      return;
    if (this._taskHandles.isEmpty())
      return;

    this._draining = true;

    return Promise.all(this._taskHandles).finally(() => {
      this._draining = false;
    });
  }
}

Meteor._AsynchronousQueue = AsynchronousQueue;

const runWithFibers = (fn) => {
  if (!Meteor._isFibersEnabled) return fn();

  Promise.await(fn());
};

Meteor._SynchronousQueue = function () {
  const self = this;
  // During the execution of a task, this is set to the fiber used to execute
  // that task. We use this to throw an error rather than deadlocking if the
  // user calls runTask from within a task on the same fiber.
  self._currentTaskFiber = undefined;
  self._asyncQueue = new AsynchronousQueue();
};

var SQp = Meteor._SynchronousQueue.prototype;

SQp.runTask = function (task) {
  var self = this;
  runWithFibers(() => self._asyncQueue.runTask(task));
};

SQp.queueTask = function (task) {
  var self = this;
  self._asyncQueue.queueTask(task);
};

SQp.flush = function () {
  var self = this;
  runWithFibers(self._asyncQueue.flush);
};

SQp.safeToRunTask = function () {
  var self = this;
  return Fiber.current && self._currentTaskFiber !== Fiber.current;
};

SQp.drain = function () {
  var self = this;
  runWithFibers(self._asyncQueue.drain());
};

SQp._scheduleRun = function () {
  var self = this;
  self._asyncQueue._scheduleRun();
};

SQp._run = function () {
  var self = this;
  runWithFibers(self._asyncQueue._run);
};

// Sleep. Mostly used for debugging (eg, inserting latency into server
// methods).
//
Meteor._sleepForMs = function (ms) {
  if (Meteor._isFibersEnabled) {
    var fiber = Fiber.current;
    setTimeout(function() {
      fiber.run();
    }, ms);
    Fiber.yield();
    return;
  }

  return new Promise(resolve => setTimeout(() => resolve(), ms));
};
