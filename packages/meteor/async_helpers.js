Meteor._noYieldsAllowed = function (f) {
  var result = f();
  if (Meteor._isPromise(result)) {
    throw new Error("function is a promise when calling Meteor._noYieldsAllowed");
  }
  return result
};

function FakeDoubleEndedQueue () {
  this.queue = [];
}

FakeDoubleEndedQueue.prototype.push = function (task) {
  this.queue.push(task);
};

FakeDoubleEndedQueue.prototype.shift = function () {
  return this.queue.shift();
};

FakeDoubleEndedQueue.prototype.isEmpty = function () {
  return this.queue.length === 0;
};

Meteor._DoubleEndedQueue = Meteor.isServer ? Npm.require('denque') : FakeDoubleEndedQueue;

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
function AsynchronousQueue () {
  this._taskHandles = new Meteor._DoubleEndedQueue();
  this._runningOrRunScheduled = false;
  // This is true if we're currently draining.  While we're draining, a further
  // drain is a noop, to prevent infinite loops.  "drain" is a heuristic type
  // operation, that has a meaning like unto "what a naive person would expect
  // when modifying a table from an observe"
  this._draining = false;
}
Object.assign(AsynchronousQueue.prototype, {
  queueTask(task) {
    const self = this;
    self._taskHandles.push({
      task: task,
      name: task.name
    });
    self._scheduleRun();
  },

  async _scheduleRun() {
    // Already running or scheduled? Do nothing.
    if (this._runningOrRunScheduled)
      return;

    this._runningOrRunScheduled = true;

    let resolve;
    const promise = new Promise(r => resolve = r);
    const runImmediateHandle = (fn) => {
      if (Meteor.isServer) {
        Meteor._runFresh(() => setImmediate(fn))
        return;
      }
      setTimeout(fn, 0);
    };
    runImmediateHandle(() => {
      this._run().finally(resolve);
    });
    return promise;
  },

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
    let exception;
    // Run the task.
    try {
      await taskHandle.task();
    } catch (err) {
      if (taskHandle.resolver) {
        // We'll throw this exception through runTask.
        exception = err;
      } else {
        Meteor._debug("Exception in queued task", err);
      }
    }

    // Soon, run the next task, if there is any.
    this._runningOrRunScheduled = false;
    this._scheduleRun();

    if (taskHandle.resolver) {
      if (exception) {
        taskHandle.resolver(null, exception);
      } else {
        taskHandle.resolver();
      }
    }
  },

  async runTask(task) {
    let resolver;
    const promise = new Promise(
      (resolve, reject) =>
      (resolver = (res, rej) => {
        if (rej) {
          reject(rej);
          return;
        }
        resolve(res);
      })
    );

    const handle = {
      task: Meteor.bindEnvironment(task, function (e) {
        Meteor._debug('Exception from task', e);
        throw e;
      }),
      name: task.name,
      resolver,
    };
    this._taskHandles.push(handle);
    await this._scheduleRun();
    return promise;
  },

  flush() {
    return this.runTask(() => { });
  },

  async drain() {
    if (this._draining)
      return;

    this._draining = true;
    while (!this._taskHandles.isEmpty()) {
      await this.flush();
    }
    this._draining = false;
  }
});

Meteor._AsynchronousQueue = AsynchronousQueue;


// Sleep. Mostly used for debugging (eg, inserting latency into server
// methods).
//
const _sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
Meteor._sleepForMs = function (ms) {
  return _sleep(ms);
};

Meteor.sleep = _sleep;