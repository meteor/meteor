/**
 * @module jobs
 * @summary Main entry point for the jobs package (server only).
 * Exports the `Jobs` singleton.
 */

import { configure, getConfig, _resetConfigForTesting } from './config.js';
import { FatalError, DuplicateError } from './errors.js';
import { JobsCollection, JobsLocksCollection } from './collection.js';
import { registerJob, hasJob, getJobDefinition, _resetRegistryForTesting } from './registration.js';
import {
  enqueueJob,
  cancelJob,
  cancelAllJobs,
  getJob,
  clearDedupKey,
} from './enqueue.js';
import {
  startLeaderElection,
  stopLeaderElection,
  isLeader,
  setOnLeaderAcquired,
  setOnLeaderLost,
} from './leader.js';
import {
  startExecutionEngine,
  stopExecutionEngine,
  getRunningJobCount,
  getRunningJobIds,
  abortLocalJob,
} from './execution.js';
import { startCronScheduler, stopCronScheduler, getCronTimerCount } from './cron.js';
import { on } from './events.js';
import { runAndWait } from './run-and-wait.js';
import { retryJob } from './retry.js';
import { runInline, executeNow } from './test-modes.js';

// Import publications (side-effect: registers Meteor.publish endpoints)
import './publications.js';

/**
 * The `Jobs` singleton — public API surface for the package.
 */
export const Jobs = {
  // --- Configuration ---------------------------------------------------

  /**
   * Merge configuration options.  Can be called multiple times; each call
   * merges on top of the previous configuration.
   *
   * @param {Object} options  See config.js for the full option schema.
   */
  configure(options) {
    configure(options);
  },

  /**
   * Return a snapshot of the current configuration.
   *
   * @returns {Object}
   */
  getConfig() {
    return getConfig();
  },

  // --- Registration -------------------------------------------------------

  /**
   * Register a job type with a full configuration object.
   *
   * Must be called during startup (before the scheduler loop begins).
   * Validates all fields eagerly — cron expressions are parsed immediately
   * via `croner` so typos surface at boot time.
   *
   * @param {Object} config  Job definition.  `name` and `run` are required.
   */
  register(config) {
    registerJob(config);
  },

  /**
   * Check whether a job type is registered.
   *
   * @param {string} name  The job name.
   * @returns {boolean}
   */
  has(name) {
    return hasJob(name);
  },

  /**
   * Retrieve the full definition for a registered job.
   *
   * @param {string} name  The job name.
   * @returns {Object|undefined}
   * @private
   */
  _getDefinition(name) {
    return getJobDefinition(name);
  },

  // --- Lifecycle events ---------------------------------------------------

  /**
   * Register a callback for a lifecycle event.
   *
   * Supported events: `enqueued`, `started`, `completed`, `failed`,
   * `cancelled`, `retrying`, `stalled`, `leader.acquired`, `leader.lost`.
   *
   * @param {string}   event     The event name.
   * @param {Function} callback  The function to invoke when the event fires.
   * @returns {{ stop: Function }}  A handle whose `.stop()` method
   *   unregisters the callback.
   */
  on(event, callback) {
    return on(event, callback);
  },

  // --- Error classes ----------------------------------------------------

  FatalError,
  DuplicateError,

  // --- Enqueue / Cancel / Query ------------------------------------------

  /**
   * Enqueue a job for execution.
   *
   * @param {string} name          A registered job name.
   * @param {Object} [data={}]     User payload forwarded to the job handler.
   * @param {Object} [options={}]  Scheduling options.
   * @param {string|number} [options.delay]      Delay before the job becomes
   *   ready.  A string is parsed by the `ms` package (e.g. `'30m'`, `'2h'`),
   *   a number is treated as milliseconds.
   * @param {Date}   [options.scheduledAt]  Exact date when the job should
   *   become ready.  Mutually exclusive with `delay`.
   * @returns {Promise<string>}  The inserted (or existing) job document _id.
   * @throws {Error}             If `name` is not registered.
   * @throws {DuplicateError}    If `onDuplicate` is `'error'` and a duplicate
   *   active job exists.
   */
  async run(name, data, options) {
    const config = getConfig();
    if (config.testMode === 'inline') {
      return runInline(name, data);
    }
    return enqueueJob(name, data, options);
  },

  /**
   * Cancel a single job.
   *
   * Sets the status to `'cancelled'` and clears the dedup key.
   * Only affects jobs in `pending`, `ready`, or `running` status.
   *
   * @param {string} jobId  The job document _id.
   * @returns {Promise<boolean>}  `true` if cancelled, `false` if the job was
   *   not found or already in a terminal state.
   */
  async cancel(jobId) {
    return cancelJob(jobId);
  },

  /**
   * Cancel all non-terminal jobs of a given type.
   *
   * @param {string} name  The registered job name.
   * @returns {Promise<number>}  The number of jobs cancelled.
   */
  async cancelAll(name) {
    return cancelAllJobs(name);
  },

  /**
   * Fetch a single job document by ID.
   *
   * @param {string} jobId  The job document _id.
   * @returns {Promise<Object|null>}  The job document, or `null` if not found.
   */
  async get(jobId) {
    return getJob(jobId);
  },

  /**
   * Enqueue a job and wait for its result.
   *
   * The job may execute on any instance in the cluster.  This method
   * observes the job document and resolves when the job reaches a
   * terminal status (`completed`, `failed`, or `cancelled`).
   *
   * @param {string} name          A registered job name.
   * @param {Object} [data={}]     User payload forwarded to the job handler.
   * @param {Object} [options={}]  Scheduling options (same as `Jobs.run()`),
   *   plus `waitTimeout` (ms, default 300000 / 5 minutes).
   * @returns {Promise<*>}  The value returned by the job handler.
   * @throws {Error}  On failure, cancellation, or timeout.
   */
  async runAndWait(name, data, options) {
    return runAndWait(name, data, options);
  },

  /**
   * Retry a failed or cancelled job.
   *
   * Resets the job to `'ready'` status with zero attempts so it can be
   * picked up as a fresh execution.  Only valid for `failed` or
   * `cancelled` jobs.
   *
   * @param {string} jobId  The job document _id.
   * @returns {Promise<string>}  The same `jobId`.
   * @throws {Error}  If the job is not found or not in a retryable status.
   */
  async retry(jobId) {
    return retryJob(jobId);
  },

  /**
   * Manually trigger execution of a specific job.
   *
   * Intended for use with `testMode: 'manual'`, where jobs are enqueued
   * but never auto-picked up.  Claims and executes the job immediately,
   * bypassing the observer and polling loop.
   *
   * @param {string} jobId  The job document _id.
   * @returns {Promise<void>}
   */
  async executeNow(jobId) {
    return executeNow(jobId);
  },

  // --- Helpers (used by other internal modules) ----------------------------

  /**
   * Clear the dedup key for a job that has reached a terminal state.
   *
   * Exported so that the execution engine can call it on completion,
   * failure, or cancellation.
   *
   * @param {string} jobId  The job document _id.
   * @returns {Promise<void>}
   * @private
   */
  async _clearDedupKey(jobId) {
    return clearDedupKey(jobId);
  },

  // --- Leader election ----------------------------------------------------

  /**
   * Start the leader election loop.
   *
   * Makes an immediate acquisition attempt.  If this instance wins it
   * becomes the leader and begins the renewal interval.  Otherwise it
   * enters follower mode and retries periodically.
   *
   * @returns {Promise<void>}
   */
  async _startLeader() {
    return startLeaderElection();
  },

  /**
   * Stop all leader election timers and, if this instance is leader,
   * release the lock immediately so another instance can take over.
   *
   * @returns {Promise<void>}
   */
  async _stopLeader() {
    return stopLeaderElection();
  },

  /**
   * Returns whether this instance currently holds the leader lock.
   *
   * @returns {boolean}
   */
  _isLeader() {
    return isLeader();
  },

  /**
   * Set the callback invoked when this instance becomes leader.
   *
   * @param {Function} fn
   */
  _setOnLeaderAcquired(fn) {
    return setOnLeaderAcquired(fn);
  },

  /**
   * Set the callback invoked when this instance loses leadership.
   *
   * @param {Function} fn
   * @returns {Function} A deregistration function.
   */
  _setOnLeaderLost(fn) {
    return setOnLeaderLost(fn);
  },

  // --- Execution engine ---------------------------------------------------

  /**
   * Start the execution engine.
   *
   * Activates the reactive observer, polling fallback, and wires
   * pending→ready promotion into the leader callbacks.
   *
   * Safe to call multiple times — subsequent calls are no-ops.
   */
  _startEngine() {
    startExecutionEngine();
  },

  /**
   * Stop the execution engine.
   *
   * Stops the observer, polling, and promotion loop.  Aborts all
   * in-flight jobs and waits for cleanup.
   *
   * @returns {Promise<void>}
   */
  async _stopEngine() {
    return stopExecutionEngine();
  },

  /**
   * Returns the number of jobs currently running on this instance.
   *
   * @returns {number}
   */
  _runningJobCount() {
    return getRunningJobCount();
  },

  /**
   * Returns the set of job IDs currently running on this instance.
   *
   * @returns {Set<string>}
   */
  _runningJobIds() {
    return getRunningJobIds();
  },

  // --- Cron scheduling ---------------------------------------------------

  /**
   * Start the cron scheduler (leader only).
   *
   * Normally called automatically when this instance becomes the leader.
   * Exposed for testing and manual control.
   *
   * @returns {Promise<void>}
   */
  async _startCron() {
    return startCronScheduler();
  },

  /**
   * Stop the cron scheduler and cancel all pending timers.
   *
   * Normally called automatically when this instance loses leadership.
   * Exposed for testing and manual control.
   */
  _stopCron() {
    stopCronScheduler();
  },

  /**
   * Number of armed cron timers. Test-only accessor.
   *
   * @returns {number}
   */
  _getCronTimerCount() {
    return getCronTimerCount();
  },

  // --- Collections (exposed for advanced use / testing) -----------------

  /**
   * The `_jobs` Mongo.Collection — use with subscriptions on the client,
   * or for direct queries on the server.
   *
   * Example: `Jobs.collection.find({ status: 'running' })`
   */
  collection: JobsCollection,

  /**
   * The underlying `_jobs` Mongo collection (alias kept for compatibility).
   */
  _collection: JobsCollection,

  /**
   * The underlying `_jobs_locks` Mongo collection.
   */
  _locksCollection: JobsLocksCollection,

  /**
   * Reset configuration to defaults.  Test-only helper.
   * @private
   */
  _resetConfig() {
    _resetConfigForTesting();
  },

  /**
   * Reset the job registry.  Test-only helper.
   * @private
   */
  _resetRegistry() {
    _resetRegistryForTesting();
  },

  /**
   * Abort a running job on this instance.
   * @param {string} jobId
   * @returns {boolean}
   * @private
   */
  _abortLocalJob(jobId) {
    return abortLocalJob(jobId);
  },
};
