'use strict';

const { Worker } = require('worker_threads');
const os = require('os');
const path = require('path');

const WORKER_PATH = path.join(__dirname, 'build-worker.js');

/**
 * A general-purpose worker thread pool for CPU-bound build operations.
 *
 * Manages a fixed set of long-lived worker threads that process tasks
 * from a shared queue. Each worker handles one task at a time; when it
 * completes, the next queued task is dispatched automatically.
 *
 * Usage:
 *   const pool = getPool();
 *   const result = await pool.submit('minify-js-swc', { source, options });
 *   const results = await pool.submitAll('analyze-globals', payloads);
 */
class WorkerPool {
  constructor(options = {}) {
    this._size = options.size || Math.max(1, os.cpus().length - 1);
    this._workerPath = options.workerPath || WORKER_PATH;
    this._modulePaths = options.modulePaths || module.paths;
    this._workers = [];
    this._queue = [];
    this._initialized = false;
    this._shutdownRequested = false;
  }

  /**
   * Lazily initialize the pool on first use.
   * Workers are long-lived and reused across tasks.
   */
  _ensureInit() {
    if (this._initialized) return;
    this._initialized = true;

    for (let i = 0; i < this._size; i++) {
      this._spawnWorker();
    }
  }

  _spawnWorker() {
    const worker = new Worker(this._workerPath, {
      workerData: {
        // Pass the main thread's module resolution paths so the worker
        // can require the same npm packages (terser, swc, babel, etc.).
        modulePaths: this._modulePaths,
      },
    });

    // Allow the process to exit even if workers are still alive.
    // For one-shot builds (meteor build), this prevents hanging.
    worker.unref();

    const entry = {
      thread: worker,
      busy: false,
      resolve: null,
      reject: null,
    };

    worker.on('message', (msg) => {
      const { resolve, reject } = entry;
      entry.busy = false;
      entry.resolve = null;
      entry.reject = null;

      if (msg.error) {
        const err = new Error(msg.error);
        if (msg.stack) err.stack = msg.stack;
        if (process.env.METEOR_WORKER_DEBUG) {
          console.error(`[worker-pool] Task error: ${msg.error}`);
        }
        reject(err);
      } else {
        resolve(msg.result);
      }

      this._dispatch();
    });

    worker.on('error', (err) => {
      if (entry.reject) {
        entry.reject(err);
        entry.busy = false;
        entry.resolve = null;
        entry.reject = null;
      }

      // Replace crashed worker unless shutting down.
      const idx = this._workers.indexOf(entry);
      if (idx >= 0 && !this._shutdownRequested) {
        this._workers.splice(idx, 1);
        this._spawnWorker();
      }
    });

    this._workers.push(entry);
    return entry;
  }

  /**
   * Submit a single task to the pool.
   * @param {string} type - The task type (must match a registered handler).
   * @param {*} payload - Serializable data for the handler.
   * @returns {Promise<*>} The handler's return value.
   */
  submit(type, payload) {
    this._ensureInit();

    return new Promise((resolve, reject) => {
      this._queue.push({ type, payload, resolve, reject });
      this._dispatch();
    });
  }

  /**
   * Submit multiple tasks of the same type in parallel.
   * Results are returned in the same order as payloads.
   * @param {string} type - The task type.
   * @param {Array<*>} payloads - Array of serializable payloads.
   * @returns {Promise<Array<*>>} Array of results in input order.
   */
  submitAll(type, payloads) {
    return Promise.all(payloads.map((p) => this.submit(type, p)));
  }

  /**
   * Dispatch queued tasks to idle workers.
   */
  _dispatch() {
    while (this._queue.length > 0) {
      const worker = this._workers.find((w) => !w.busy);
      if (!worker) break;

      const task = this._queue.shift();
      worker.busy = true;
      worker.resolve = task.resolve;
      worker.reject = task.reject;
      worker.thread.postMessage({ type: task.type, payload: task.payload });
    }
  }

  /**
   * Gracefully shut down all workers.
   * Rejects any pending queued tasks.
   */
  async shutdown() {
    this._shutdownRequested = true;

    for (const task of this._queue) {
      task.reject(new Error('Worker pool shutting down'));
    }
    this._queue = [];

    await Promise.all(this._workers.map((w) => w.thread.terminate()));
    this._workers = [];
    this._initialized = false;
    this._shutdownRequested = false;
  }

  get size() {
    return this._size;
  }

  get pending() {
    return this._queue.length;
  }

  get active() {
    return this._workers.filter((w) => w.busy).length;
  }
}

// ---------------------------------------------------------------------------
// Singleton pool management
// ---------------------------------------------------------------------------

let _pool = null;

/**
 * Get or create the shared build worker pool.
 * The pool is lazily initialized on first task submission.
 */
function getPool() {
  if (!_pool) {
    const size = parseInt(process.env.METEOR_WORKER_POOL_SIZE, 10) ||
      Math.max(1, os.cpus().length - 1);

    _pool = new WorkerPool({ size });

    // Also expose on global so Meteor packages (standard-minifier-js,
    // babel-compiler, etc.) can access the pool without requiring
    // files from tools/.
    global.__meteor_worker_pool = _pool;
  }
  return _pool;
}

/**
 * Shut down the shared pool and release all worker threads.
 */
async function shutdownPool() {
  if (_pool) {
    await _pool.shutdown();
    _pool = null;
    global.__meteor_worker_pool = null;
  }
}

/**
 * Check whether a pool has been created.
 */
function hasPool() {
  return _pool !== null && _pool._initialized;
}

module.exports = { WorkerPool, getPool, shutdownPool, hasPool };
