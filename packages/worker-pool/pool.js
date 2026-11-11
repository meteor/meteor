/**
 * @module worker-pool/pool
 * @summary Core pool management: spawn, dispatch, recycle, idle timeout,
 * health monitoring, and graceful shutdown.
 */

import { Worker } from 'worker_threads';
import os from 'os';
import { createThreadContext } from 'meteor/thread-context';

// --- Constants ---------------------------------------------------------------

/** @enum {string} Message types shared with worker-entry.js */
export const MSG = {
  READY: 'ready',
  TASK: 'task',
  RESULT: 'result',
  ERROR: 'error',
  HEARTBEAT_PING: 'heartbeat:ping',
  HEARTBEAT_PONG: 'heartbeat:pong',
  SHUTDOWN: 'shutdown',
};

/** Worker states */
const STATE = {
  SPAWNING: 'spawning',
  IDLE: 'idle',
  BUSY: 'busy',
  RECYCLING: 'recycling',
  TERMINATED: 'terminated',
};

/**
 * @typedef {Object} PoolOptions
 * @property {number} [min=0] - Minimum idle workers kept alive.
 * @property {number} [max] - Maximum concurrent workers (default: os.availableParallelism() - 1).
 * @property {number} [idleTimeout=30000] - Kill idle workers after this many ms.
 * @property {number} [taskTimeout=300000] - Default per-task timeout in ms.
 * @property {number} [recycleAfter=1000] - Recycle a worker after this many tasks.
 * @property {number} [heartbeatInterval=15000] - Interval between heartbeat pings in ms.
 * @property {number} [heartbeatTimeout=5000] - Max time to wait for a heartbeat pong.
 * @property {string|null} [workerScript=null] - Path to a custom worker script. Uses built-in entry by default.
 * @property {string|null} [userId=null] - User ID forwarded to thread-context.
 * @property {string|null} [connectionId=null] - DDP connection ID forwarded to thread-context.
 * @property {number} [callTimeout=60000] - Per-call timeout for thread-context bridge calls.
 * @property {boolean} [enableHeartbeat=true] - Whether to run the heartbeat monitor.
 */

/**
 * @typedef {Object} PoolStats
 * @property {number} total - Total workers (all states).
 * @property {number} idle - Workers waiting for a task.
 * @property {number} busy - Workers currently executing a task.
 * @property {number} spawning - Workers currently starting up.
 * @property {number} pending - Queued tasks waiting for a free worker.
 */

// --- Handler serialization cache ---------------------------------------------

/** @type {WeakMap<Function, string>} Caches handler.toString() by function reference. */
const _toStringCache = new WeakMap();

/**
 * Returns the string representation of a handler, caching the result so that
 * the same function reference is only serialized once.
 * @param {Function} handler
 * @returns {string}
 */
function _serializeHandler(handler) {
  let s = _toStringCache.get(handler);
  if (!s) {
    s = handler.toString();
    _toStringCache.set(handler, s);
  }
  return s;
}

// --- PoolWorker (internal) ---------------------------------------------------

/** Wraps a Node.js Worker with pool-specific metadata. */
class PoolWorker {
  /**
   * @param {Worker} worker - The underlying Node.js Worker.
   * @param {Object} threadContext - The thread-context bridge object (has .destroy()).
   */
  constructor(worker, threadContext) {
    /** @type {Worker} */
    this.worker = worker;
    /** @type {Object} */
    this.threadContext = threadContext;
    /** @type {string|null} Managed exclusively via WorkerPool._changeState. */
    this.state = null;
    /** @type {number} */
    this.taskCount = 0;
    /** @type {number} */
    this.lastActivity = Date.now();
    /** @type {ReturnType<typeof setTimeout>|null} */
    this.idleTimer = null;
    /** @type {number|null} */
    this.lastHeartbeat = null;
    /** @type {string|null} Current task ID being executed. */
    this.currentTaskId = null;
    /** @type {boolean} True if this worker is being recycled (replacement deferred to exit). */
    this.recycling = false;
  }
}

// --- WorkerPool (public) -----------------------------------------------------

export class WorkerPool {
  /**
   * @param {PoolOptions} [options]
   */
  constructor(options = {}) {
    const maxDefault = (typeof os.availableParallelism === 'function'
      ? os.availableParallelism()
      : os.cpus().length) - 1;

    /** @type {number} */
    this.min = Math.max(0, options.min ?? 0);
    /** @type {number} */
    this.max = Math.max(1, options.max ?? Math.max(1, maxDefault));
    /** @type {number} */
    this.idleTimeout = options.idleTimeout ?? 30000;
    /** @type {number} */
    this.taskTimeout = options.taskTimeout ?? 300000;
    /** @type {number} */
    this.recycleAfter = options.recycleAfter ?? 1000;
    /** @type {number} */
    this.heartbeatInterval = options.heartbeatInterval ?? 15000;
    /** @type {number} */
    this.heartbeatTimeout = options.heartbeatTimeout ?? 5000;
    /** @type {string|null} */
    this.workerScript = options.workerScript ?? null;
    /** @type {string|null} */
    this.userId = options.userId ?? null;
    /** @type {string|null} */
    this.connectionId = options.connectionId ?? null;
    /** @type {number} */
    this.callTimeout = options.callTimeout ?? 60000;
    /** @type {boolean} */
    this.enableHeartbeat = options.enableHeartbeat !== false;

    /** @type {Map<number, PoolWorker>} worker threadId -> PoolWorker */
    this._workers = new Map();
    /** @type {Set<PoolWorker>} O(1) idle worker lookup. */
    this._idleWorkers = new Set();
    /** @type {Object<string, number>} Incremental state counters, updated via _changeState. */
    this._stateCounts = {
      [STATE.SPAWNING]: 0,
      [STATE.IDLE]: 0,
      [STATE.BUSY]: 0,
      [STATE.RECYCLING]: 0,
      [STATE.TERMINATED]: 0,
    };

    // Task queue with O(1) enqueue/dequeue via head-pointer + periodic compaction.
    /** @type {Array<Object>} */
    this._queueItems = [];
    /** @type {number} Index of the next entry to dequeue. */
    this._queueHead = 0;
    /** @type {number} Count of active (non-cancelled) entries in the queue. */
    this._queueSize = 0;

    /** @type {boolean} */
    this._draining = false;
    /** @type {boolean} */
    this._terminated = false;
    /** @type {Promise<void>|null} */
    this._drainPromise = null;
    /** @type {Function|null} */
    this._drainResolve = null;
    /** @type {Map<string, { resolve: Function, reject: Function, timer: ReturnType<typeof setTimeout>, workerId: number }>} */
    this._pendingTasks = new Map();
    /** @type {ReturnType<typeof setInterval>|null} */
    this._heartbeatTimer = null;
    /** @type {string|null} Resolved path to the worker entry script. */
    this._resolvedWorkerScript = null;
    /** @type {string|null} Resolved path to the thread-context hydrate module. */
    this._hydrateContextPath = null;

    // Pre-spawn minimum workers.
    for (let i = 0; i < this.min; i++) {
      this._spawnWorker();
    }

    // Start heartbeat monitor.
    if (this.enableHeartbeat && this.heartbeatInterval > 0) {
      this._heartbeatTimer = setInterval(() => this._heartbeatCheck(), this.heartbeatInterval);
      if (this._heartbeatTimer.unref) this._heartbeatTimer.unref();
    }
  }

  // --- Public API ------------------------------------------------------------

  /**
   * Dispatches a task to a worker. If no worker is available, the task is
   * queued until one becomes free (or a new one is spawned if below max).
   *
   * @param {Object} taskOptions
   * @param {Function} taskOptions.handler - The function to execute in the worker.
   *   Signature: `async (data, context) => result`.
   * @param {string} [taskOptions.handlerName] - Name of a pre-registered handler (alternative to handler).
   * @param {*} [taskOptions.data] - Structured-clone-safe data passed to the handler.
   * @param {number} [taskOptions.timeout] - Per-task timeout override (ms).
   * @returns {Promise<*>} The handler's return value.
   */
  dispatch({ handler, handlerName, data, timeout } = {}) {
    if (this._terminated) {
      return Promise.reject(new Error('WorkerPool has been terminated'));
    }
    if (this._draining) {
      return Promise.reject(new Error('WorkerPool is draining; no new tasks accepted'));
    }
    if (!handler && !handlerName) {
      return Promise.reject(new Error('dispatch() requires either handler or handlerName'));
    }

    const taskId = _generateId();
    const taskTimeout = timeout ?? this.taskTimeout;

    const task = {
      type: MSG.TASK,
      id: taskId,
      fnString: handler ? _serializeHandler(handler) : null,
      handlerName: handlerName || null,
      data: data !== undefined ? data : null,
    };

    return new Promise((resolve, reject) => {
      // Entry tracks queue membership; entries dispatched directly are never enqueued.
      const entry = { resolve, reject, task, timer: null, cancelled: false, enqueued: false };

      // Set up task timeout.
      entry.timer = setTimeout(() => {
        this._pendingTasks.delete(taskId);
        // Mark cancelled so dequeue skips it; only adjust count if actually queued.
        if (entry.enqueued && !entry.cancelled) {
          entry.cancelled = true;
          this._queueSize--;
        }
        reject(new Error(`Task timed out after ${taskTimeout}ms`));
      }, taskTimeout);
      if (entry.timer.unref) entry.timer.unref();

      // Try to find an idle worker.
      const worker = this._getIdleWorker();
      if (worker) {
        this._assignTask(worker, task, resolve, reject, entry.timer);
      } else if (this._workers.size < this.max) {
        // Spawn a new worker and queue the task (it'll be dispatched when ready).
        this._enqueue(entry);
        this._spawnWorker();
      } else {
        // All workers busy, queue the task.
        this._enqueue(entry);
      }
    });
  }

  /**
   * Returns current pool statistics.
   * @returns {PoolStats}
   */
  stats() {
    return {
      total: this._workers.size,
      idle: this._stateCounts[STATE.IDLE],
      busy: this._stateCounts[STATE.BUSY],
      spawning: this._stateCounts[STATE.SPAWNING],
      pending: this._queueSize,
    };
  }

  /**
   * Graceful shutdown: stop accepting new tasks and wait for all active
   * tasks to complete. Idle workers are terminated immediately. Busy workers
   * are terminated once their current task finishes.
   *
   * @returns {Promise<void>} Resolves when all workers have exited.
   */
  drain() {
    if (this._drainPromise) return this._drainPromise;
    this._draining = true;

    // Reject all queued (not yet dispatched) tasks.
    this._rejectAllQueued('WorkerPool is draining; task was never dispatched');

    // Terminate idle workers immediately (copy the set since _terminateWorker mutates it).
    for (const pw of [...this._idleWorkers]) {
      this._terminateWorker(pw);
    }

    // If no busy workers remain, resolve immediately.
    if (this._stateCounts[STATE.BUSY] === 0) {
      this._cleanupPool();
      this._drainPromise = Promise.resolve();
      return this._drainPromise;
    }

    this._drainPromise = new Promise((resolve) => {
      this._drainResolve = resolve;
    });
    return this._drainPromise;
  }

  /**
   * Force-kills all workers immediately. Pending and active tasks are
   * rejected with an error.
   *
   * @returns {Promise<void>} Resolves once all workers have exited.
   */
  async terminate() {
    this._terminated = true;
    this._draining = true;

    // Stop heartbeat.
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }

    // Reject queued tasks.
    this._rejectAllQueued('WorkerPool terminated');

    // Reject pending tasks.
    for (const [taskId, entry] of this._pendingTasks) {
      clearTimeout(entry.timer);
      entry.reject(new Error('WorkerPool terminated'));
    }
    this._pendingTasks.clear();

    // Terminate all workers.
    const exits = [];
    for (const pw of this._workers.values()) {
      exits.push(this._terminateWorker(pw));
    }

    await Promise.allSettled(exits);
    this._workers.clear();
    this._idleWorkers.clear();
    for (const key of Object.keys(this._stateCounts)) {
      this._stateCounts[key] = 0;
    }

    if (this._drainResolve) {
      this._drainResolve();
      this._drainResolve = null;
    }
  }

  // --- Internal: State management -------------------------------------------

  /**
   * Transitions a worker to a new state, maintaining incremental counters
   * and the idle worker set.
   * @param {PoolWorker} pw
   * @param {string} newState
   * @private
   */
  _changeState(pw, newState) {
    const oldState = pw.state;
    if (oldState === newState) return;
    if (oldState) {
      this._stateCounts[oldState]--;
      if (oldState === STATE.IDLE) this._idleWorkers.delete(pw);
    }
    this._stateCounts[newState]++;
    if (newState === STATE.IDLE) this._idleWorkers.add(pw);
    pw.state = newState;
  }

  /**
   * Removes a worker from the pool entirely, decrementing its current state
   * counter and clearing it from all tracking structures.
   * @param {PoolWorker} pw
   * @private
   */
  _removeFromPool(pw) {
    if (pw.state) {
      this._stateCounts[pw.state]--;
      if (pw.state === STATE.IDLE) this._idleWorkers.delete(pw);
    }
    pw.state = null;
    this._workers.delete(pw.worker.threadId);
  }

  // --- Internal: Queue -------------------------------------------------------

  /**
   * Adds an entry to the task queue.
   * @param {Object} entry
   * @private
   */
  _enqueue(entry) {
    entry.enqueued = true;
    this._queueItems.push(entry);
    this._queueSize++;
  }

  /**
   * Removes and returns the next non-cancelled entry from the queue,
   * or null if the queue is empty / all remaining entries are cancelled.
   * @returns {Object|null}
   * @private
   */
  _dequeue() {
    while (this._queueHead < this._queueItems.length) {
      const entry = this._queueItems[this._queueHead];
      this._queueItems[this._queueHead] = null; // release reference
      this._queueHead++;

      // Compact when head exceeds half the array and array is non-trivial.
      if (this._queueHead > 1024 && this._queueHead > (this._queueItems.length >>> 1)) {
        this._queueItems = this._queueItems.slice(this._queueHead);
        this._queueHead = 0;
      }

      if (!entry.cancelled) {
        this._queueSize--;
        return entry;
      }
    }

    // Queue exhausted, reset.
    this._queueItems.length = 0;
    this._queueHead = 0;
    return null;
  }

  /**
   * Rejects all non-cancelled queued entries and resets the queue.
   * @param {string} message - Error message for rejected tasks.
   * @private
   */
  _rejectAllQueued(message) {
    for (let i = this._queueHead; i < this._queueItems.length; i++) {
      const entry = this._queueItems[i];
      if (entry && !entry.cancelled) {
        clearTimeout(entry.timer);
        entry.reject(new Error(message));
      }
    }
    this._queueItems.length = 0;
    this._queueHead = 0;
    this._queueSize = 0;
  }

  // --- Internal: Spawning ----------------------------------------------------

  /**
   * Spawns a new worker thread with a fresh thread-context bridge.
   * @private
   */
  _spawnWorker() {
    if (this._terminated) return;

    // Create a thread-context bridge for this worker.
    const ctx = createThreadContext({
      userId: this.userId,
      connectionId: this.connectionId,
      callTimeout: this.callTimeout,
    });

    // Resolve the worker entry script path.
    const scriptPath = this._getWorkerScriptPath();
    const hydrateContextPath = this._getHydrateContextPath();

    const worker = new Worker(scriptPath, {
      workerData: {
        port: ctx.port,
        settings: ctx.settings,
        userId: ctx.userId,
        callTimeout: ctx.callTimeout,
        hydrateContextPath,
      },
      transferList: [ctx.port],
    });

    const pw = new PoolWorker(worker, ctx);
    this._workers.set(worker.threadId, pw);
    this._changeState(pw, STATE.SPAWNING);

    worker.on('message', (msg) => this._onWorkerMessage(pw, msg));
    worker.on('error', (err) => this._onWorkerError(pw, err));
    worker.on('exit', (code) => this._onWorkerExit(pw, code));
  }

  /**
   * Resolves the path to the worker entry script.
   * @returns {string}
   * @private
   */
  _getWorkerScriptPath() {
    if (this.workerScript) return this.workerScript;

    if (!this._resolvedWorkerScript) {
      // The worker-entry.js is added as an asset via package.js.
      // Assets.absoluteFilePath resolves it at runtime.
      this._resolvedWorkerScript = Assets.absoluteFilePath('worker-entry.js');
    }
    return this._resolvedWorkerScript;
  }

  /**
   * Resolves the path to the thread-context hydrate module so the worker
   * can require() it outside Meteor's module system.
   * @returns {string|null}
   * @private
   */
  _getHydrateContextPath() {
    if (this._hydrateContextPath !== null) return this._hydrateContextPath;

    try {
      // In a bundled Meteor app, the thread-context package's worker.js is
      // compiled into the server bundle. We resolve it by looking for the
      // package export module.
      this._hydrateContextPath = require.resolve('meteor/thread-context/worker.js');
    } catch {
      try {
        // Alternative: try to resolve the main entry point.
        this._hydrateContextPath = require.resolve('meteor/thread-context');
      } catch {
        this._hydrateContextPath = '';
      }
    }
    return this._hydrateContextPath || null;
  }

  // --- Internal: Worker message handling -------------------------------------

  /**
   * Handles messages from a worker thread.
   * @param {PoolWorker} pw
   * @param {Object} msg
   * @private
   */
  _onWorkerMessage(pw, msg) {
    pw.lastActivity = Date.now();

    switch (msg.type) {
      case MSG.READY:
        this._onWorkerReady(pw);
        break;

      case MSG.RESULT:
        this._onTaskResult(pw, msg.id, msg.result);
        break;

      case MSG.ERROR:
        this._onTaskError(pw, msg.id, msg.error);
        break;

      case MSG.HEARTBEAT_PONG:
        pw.lastHeartbeat = msg.ts;
        break;
    }
  }

  /**
   * Called when a worker signals it is ready.
   * @param {PoolWorker} pw
   * @private
   */
  _onWorkerReady(pw) {
    this._changeState(pw, STATE.IDLE);
    this._dispatchNextFromQueue(pw);
  }

  /**
   * Called when a task completes successfully.
   * @param {PoolWorker} pw
   * @param {string} taskId
   * @param {*} result
   * @private
   */
  _onTaskResult(pw, taskId, result) {
    const entry = this._pendingTasks.get(taskId);
    if (entry) {
      clearTimeout(entry.timer);
      this._pendingTasks.delete(taskId);
      entry.resolve(result);
    }

    pw.taskCount++;
    pw.currentTaskId = null;
    this._afterTaskComplete(pw);
  }

  /**
   * Called when a task fails with an error.
   * @param {PoolWorker} pw
   * @param {string} taskId
   * @param {Object} errorInfo
   * @private
   */
  _onTaskError(pw, taskId, errorInfo) {
    const entry = this._pendingTasks.get(taskId);
    if (entry) {
      clearTimeout(entry.timer);
      this._pendingTasks.delete(taskId);

      const err = new Error(errorInfo.message);
      err.name = errorInfo.name || 'Error';
      err.stack = errorInfo.stack || '';
      if (errorInfo.meteorError !== undefined) err.error = errorInfo.meteorError;
      if (errorInfo.meteorReason !== undefined) err.reason = errorInfo.meteorReason;
      if (errorInfo.meteorDetails !== undefined) err.details = errorInfo.meteorDetails;
      entry.reject(err);
    }

    if (taskId !== '__init__') {
      pw.taskCount++;
      pw.currentTaskId = null;
      this._afterTaskComplete(pw);
    }
  }

  /**
   * Common logic after a task finishes (result or error). Handles recycling,
   * draining, and dispatching the next queued task.
   * @param {PoolWorker} pw
   * @private
   */
  _afterTaskComplete(pw) {
    // Recycle if task count threshold reached.
    if (this.recycleAfter > 0 && pw.taskCount >= this.recycleAfter) {
      this._recycleWorker(pw);
      return;
    }

    // If draining, terminate this now-idle worker.
    if (this._draining) {
      this._terminateWorker(pw);
      if (this._stateCounts[STATE.BUSY] === 0 && this._drainResolve) {
        this._cleanupPool();
        this._drainResolve();
        this._drainResolve = null;
      }
      return;
    }

    // Mark idle and try to dispatch next queued task.
    this._changeState(pw, STATE.IDLE);
    this._dispatchNextFromQueue(pw);

    // If still idle after dispatch attempt, start the idle timer.
    if (pw.state === STATE.IDLE) {
      this._startIdleTimer(pw);
    }
  }

  /**
   * Handles a worker error event (unhandled exception in worker thread).
   * @param {PoolWorker} pw
   * @param {Error} err
   * @private
   */
  _onWorkerError(pw, err) {
    // Reject the current task if any.
    if (pw.currentTaskId) {
      const entry = this._pendingTasks.get(pw.currentTaskId);
      if (entry) {
        clearTimeout(entry.timer);
        this._pendingTasks.delete(pw.currentTaskId);
        entry.reject(err);
      }
      pw.currentTaskId = null;
    }
  }

  /**
   * Handles a worker exit event.
   * @param {PoolWorker} pw
   * @param {number} code
   * @private
   */
  _onWorkerExit(pw, code) {
    // Clean up idle timer.
    if (pw.idleTimer) {
      clearTimeout(pw.idleTimer);
      pw.idleTimer = null;
    }

    // Destroy the thread-context bridge.
    if (pw.threadContext) {
      try { pw.threadContext.destroy(); } catch { /* already destroyed */ }
    }

    // Reject any pending task that was assigned to this worker.
    if (pw.currentTaskId) {
      const entry = this._pendingTasks.get(pw.currentTaskId);
      if (entry) {
        clearTimeout(entry.timer);
        this._pendingTasks.delete(pw.currentTaskId);
        entry.reject(new Error(`Worker exited unexpectedly with code ${code}`));
      }
      pw.currentTaskId = null;
    }

    const wasRecycling = pw.recycling;
    this._removeFromPool(pw);

    // If draining and no more busy workers, resolve the drain promise.
    if (this._draining) {
      if (this._stateCounts[STATE.BUSY] === 0 && this._drainResolve) {
        this._cleanupPool();
        this._drainResolve();
        this._drainResolve = null;
      }
      return;
    }

    // Spawn a replacement if needed: recycled worker, below minimum, or queued tasks.
    if (!this._terminated) {
      const shouldSpawn = wasRecycling || this._workers.size < this.min || this._queueSize > 0;
      if (shouldSpawn && this._workers.size < this.max) {
        this._spawnWorker();
      }
    }
  }

  // --- Internal: Task dispatch -----------------------------------------------

  /**
   * Returns an idle worker, or null if none are available. O(1) via idle set.
   * @returns {PoolWorker|null}
   * @private
   */
  _getIdleWorker() {
    for (const pw of this._idleWorkers) return pw;
    return null;
  }

  /**
   * Assigns a task to a specific worker.
   * @param {PoolWorker} pw
   * @param {Object} task
   * @param {Function} resolve
   * @param {Function} reject
   * @param {ReturnType<typeof setTimeout>} timer
   * @private
   */
  _assignTask(pw, task, resolve, reject, timer) {
    // Clear idle timer.
    if (pw.idleTimer) {
      clearTimeout(pw.idleTimer);
      pw.idleTimer = null;
    }

    this._changeState(pw, STATE.BUSY);
    pw.currentTaskId = task.id;
    pw.lastActivity = Date.now();

    this._pendingTasks.set(task.id, {
      resolve,
      reject,
      timer,
      workerId: pw.worker.threadId,
    });

    pw.worker.postMessage(task);
  }

  /**
   * Dispatches the next queued task to the given worker, if any.
   * Automatically skips cancelled (timed-out) entries.
   * @param {PoolWorker} pw
   * @private
   */
  _dispatchNextFromQueue(pw) {
    const next = this._dequeue();
    if (!next) return;

    this._assignTask(pw, next.task, next.resolve, next.reject, next.timer);
  }

  // --- Internal: Worker lifecycle --------------------------------------------

  /**
   * Recycles a worker: terminate it and spawn a fresh replacement once it
   * exits (deferred to _onWorkerExit to avoid temporarily exceeding max).
   * @param {PoolWorker} pw
   * @private
   */
  _recycleWorker(pw) {
    pw.recycling = true;
    this._changeState(pw, STATE.RECYCLING);
    this._terminateWorker(pw);
  }

  /**
   * Terminates a worker. Sends a graceful shutdown message first, then
   * force-kills after a short grace period.
   * @param {PoolWorker} pw
   * @returns {Promise<void>} Resolves when the worker exits.
   * @private
   */
  _terminateWorker(pw) {
    if (pw.state === STATE.TERMINATED || pw.state === null) return Promise.resolve();

    this._changeState(pw, STATE.TERMINATED);

    // Clear idle timer.
    if (pw.idleTimer) {
      clearTimeout(pw.idleTimer);
      pw.idleTimer = null;
    }

    return new Promise((resolve) => {
      const forceKillTimer = setTimeout(() => {
        try { pw.worker.terminate(); } catch { /* already terminated */ }
      }, 2000);
      if (forceKillTimer.unref) forceKillTimer.unref();

      pw.worker.once('exit', () => {
        clearTimeout(forceKillTimer);
        resolve();
      });

      try {
        pw.worker.postMessage({ type: MSG.SHUTDOWN });
      } catch {
        // Worker may already be terminated.
        try { pw.worker.terminate(); } catch { /* ignore */ }
      }
    });
  }

  /**
   * Starts the idle timeout timer for a worker.
   * @param {PoolWorker} pw
   * @private
   */
  _startIdleTimer(pw) {
    if (pw.idleTimer) {
      clearTimeout(pw.idleTimer);
    }

    if (this.idleTimeout <= 0) return;

    pw.idleTimer = setTimeout(() => {
      // Don't terminate if we'd go below minimum.
      if (this._workers.size <= this.min) return;

      // Only terminate if still idle.
      if (pw.state === STATE.IDLE) {
        this._terminateWorker(pw);
      }
    }, this.idleTimeout);

    if (pw.idleTimer.unref) pw.idleTimer.unref();
  }

  // --- Internal: Health monitoring -------------------------------------------

  /**
   * Runs a heartbeat check on idle workers only. Busy workers are already
   * monitored via their per-task timeout, so pinging them would be wasteful
   * and could trigger false-positive timeouts during CPU-intensive tasks.
   * @private
   */
  _heartbeatCheck() {
    const now = Date.now();

    // Copy the set since _terminateWorker mutates _idleWorkers via _changeState.
    for (const pw of [...this._idleWorkers]) {
      // If the last heartbeat response is too old, the worker may be stuck.
      if (pw.lastHeartbeat !== null) {
        const sinceLastPong = now - pw.lastHeartbeat;
        if (sinceLastPong > this.heartbeatInterval + this.heartbeatTimeout) {
          // Worker is unresponsive. Terminate and let the exit handler respawn.
          this._onWorkerError(pw, new Error('Worker heartbeat timeout'));
          this._terminateWorker(pw);
          continue;
        }
      }

      // Send a heartbeat ping.
      try {
        pw.worker.postMessage({ type: MSG.HEARTBEAT_PING });
        if (pw.lastHeartbeat === null) {
          pw.lastHeartbeat = now; // Initialize so the first check doesn't false-positive.
        }
      } catch {
        // Worker may be terminating.
      }
    }
  }

  // --- Internal: Utility -----------------------------------------------------

  /**
   * Final cleanup after all workers have exited during drain.
   * @private
   */
  _cleanupPool() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }
}

// --- Helpers -----------------------------------------------------------------

let _idSeq = 0;

/**
 * Generates a unique task ID. Uses a monotonic counter only; the sequence
 * is sufficient for uniqueness within a single process.
 * @returns {string}
 */
function _generateId() {
  return 'wp_' + (++_idSeq);
}
