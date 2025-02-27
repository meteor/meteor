class AsynchronousQueue {
  /**
   * Creates a queue that processes tasks in parallel batches while preserving completion order
   * when needed. Configurable batch size and concurrency limits help optimize throughput.
   * 
   * Batch size and concurrency are configured via environment variables:
   * - METEOR_ASYNC_QUEUE_BATCH_SIZE: Number of tasks to process in each batch (default: 128)
   * - METEOR_ASYNC_QUEUE_MAX_CONCURRENT: Maximum number of concurrent tasks (default: 16)
   * 
   * @param {Object} options
   * @param {boolean} [options.orderMatters=true] Whether task completion order should be preserved
   */
  constructor({ orderMatters = true } = {}) {
    this._batchSize = parseInt(
      process.env.METEOR_ASYNC_QUEUE_BATCH_SIZE ||
      '128'
    );
    
    this._maxConcurrent = parseInt(
      process.env.METEOR_ASYNC_QUEUE_MAX_CONCURRENT ||
      '16'
    );
    
    this._orderMatters = orderMatters;

    this._taskHandles = new Meteor._DoubleEndedQueue();
    this._runningOrRunScheduled = false;
    this._draining = false;
    this._activePromises = new Set();
  }

  queueTask(task) {
    const wrappedTask = Meteor.bindEnvironment(task, function (e) {
      Meteor._debug('Exception from task', e);
      throw e;
    });

    this._taskHandles.push({
      task: wrappedTask,
      name: task.name
    });

    this._scheduleRun();
  }

  async _scheduleRun() {
    if (this._runningOrRunScheduled) return;
    this._runningOrRunScheduled = true;

    const runImmediateHandle = (fn) => {
      if (Meteor.isServer) {
        Meteor._runFresh(() => setImmediate(fn));
        return;
      }
      setTimeout(fn, 0);
    };

    return new Promise(resolve => {
      runImmediateHandle(() => {
        this._run().finally(resolve);
      });
    });
  }

  async _run() {
    if (!this._runningOrRunScheduled) {
      throw new Error("expected to be _runningOrRunScheduled");
    }

    if (this._taskHandles.isEmpty()) {
      this._runningOrRunScheduled = false;
      return;
    }

    // Collect tasks for the current batch
    const batch = [];
    while (batch.length < this._batchSize && !this._taskHandles.isEmpty()) {
      batch.push(this._taskHandles.shift());
    }

    // Process batch
    if (this._orderMatters) {
      await this._processOrderedBatch(batch);
    } else {
      await this._processParallelBatch(batch);
    }

    // Schedule next batch if there are more tasks
    this._runningOrRunScheduled = false;
    if (!this._taskHandles.isEmpty()) {
      this._scheduleRun();
    }
  }

  async _processParallelBatch(batch) {
    const taskPromises = batch.map(async taskHandle => {
      try {
        const promise = taskHandle.task();
        this._activePromises.add(promise);
        const result = await promise;
        this._activePromises.delete(promise);

        if (taskHandle.resolver) {
          taskHandle.resolver(result);
        }
      } catch (err) {
        if (taskHandle.resolver) {
          taskHandle.resolver(null, err);
        } else {
          Meteor._debug("Exception in queued task", err);
        }
      }
    });

    // Process in chunks to control concurrency
    for (let i = 0; i < taskPromises.length; i += this._maxConcurrent) {
      const chunk = taskPromises.slice(i, i + this._maxConcurrent);
      await Promise.all(chunk);
    }
  }

  async _processOrderedBatch(batch) {
    for (const taskHandle of batch) {
      try {
        const result = await taskHandle.task();
        if (taskHandle.resolver) {
          taskHandle.resolver(result);
        }
      } catch (err) {
        if (taskHandle.resolver) {
          taskHandle.resolver(null, err);
        } else {
          Meteor._debug("Exception in queued task", err);
        }
      }
    }
  }

  async runTask(task) {
    return new Promise((resolve, reject) => {
      const resolver = (res, err) => err ? reject(err) : resolve(res);
      this._taskHandles.push({ task, name: task.name, resolver });
      this._scheduleRun();
    });
  }

  flush() {
    return this.runTask(() => {});
  }

  async drain() {
    if (this._draining) return;
    this._draining = true;

    while (!this._taskHandles.isEmpty() || this._activePromises.size > 0) {
      await this.flush();
      if (this._activePromises.size > 0) {
        await Promise.all(Array.from(this._activePromises));
      }
    }

    this._draining = false;
  }
}

Meteor._AsynchronousQueue = AsynchronousQueue;

/**
 * Backwards compatibility
 */
Meteor._SynchronousQueue = AsynchronousQueue;