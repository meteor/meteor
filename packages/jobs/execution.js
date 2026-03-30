/**
 * @module jobs/execution
 * @summary Execution engine — reactive pickup, atomic claiming, job execution,
 * heartbeat, pending→ready promotion, retry/backoff, stalled job detection,
 * retention cleanup, and graceful shutdown.
 *
 * The engine is started via `startExecutionEngine()` and stopped via
 * `stopExecutionEngine()`.  It is *not* started on import — callers must
 * explicitly opt in.
 */

import os from 'os';
import { Random } from 'meteor/random';
import { JobsCollection } from './collection.js';
import { getConfig } from './config.js';
import { getJobDefinition } from './registration.js';
import { FatalError } from './errors.js';
import { isLeader, setOnLeaderAcquired, setOnLeaderLost } from './leader.js';
import { startCronScheduler, stopCronScheduler } from './cron.js';
import { emit } from './events.js';
import { RESET_CLAIM_FIELDS } from './helpers.js';

// ---------------------------------------------------------------------------
// Worker pool (lazy, singleton — weak dependency on worker-pool package)
// ---------------------------------------------------------------------------

/**
 * Whether the worker-pool package is available.
 * `null` = not yet checked, `true` / `false` = checked.
 * @type {boolean|null}
 * @private
 */
let _workerPoolAvailable = null;

/**
 * Singleton WorkerPool instance (created on first use).
 * @type {Object|null}
 * @private
 */
let _pool = null;

/**
 * Lazily check for the worker-pool weak dependency and create a singleton
 * pool the first time a job requests `offload: true`.
 *
 * @returns {Object|null}  The WorkerPool instance, or `null` if the
 *   worker-pool package is not installed.
 * @private
 */
function getWorkerPool() {
  if (_workerPoolAvailable === null) {
    try {
      const wpPkg = Package['worker-pool'];
      const WorkerPool = wpPkg && wpPkg.WorkerPool;
      _workerPoolAvailable = !!WorkerPool;
      if (_workerPoolAvailable && !_pool) {
        _pool = new WorkerPool({
          min: 0,
          max: Math.max(1, (os.availableParallelism?.() || os.cpus().length) - 1),
          taskTimeout: 300000,
        });
      }
    } catch (e) {
      _workerPoolAvailable = false;
    }
  }
  return _pool;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

/**
 * Map of currently-running job IDs to their runtime handles.
 * Used for heartbeat cleanup and abort-on-shutdown.
 *
 * @type {Map<string, { heartbeatHandle: ReturnType<typeof setInterval>, abortController: AbortController, timeoutHandle: ReturnType<typeof setTimeout> }>}
 * @private
 */
const _runningJobs = new Map();

/** @type {Object|null} Meteor observe handle returned by `.observe()`. */
let _observer = null;

/** @type {ReturnType<typeof setInterval>|null} Polling fallback interval. */
let _pollInterval = null;

/** @type {ReturnType<typeof setInterval>|null} Pending→ready promotion interval (leader only). */
let _promotionInterval = null;

/** @type {ReturnType<typeof setInterval>|null} Stalled job detection interval (leader only). */
let _stalledInterval = null;

/** @type {ReturnType<typeof setInterval>|null} Retention cleanup interval (leader only). */
let _retentionInterval = null;

/** @type {boolean} Whether the engine is currently running. */
let _engineRunning = false;

/**
 * Set of job IDs for which a claim attempt is already in-flight.
 * Prevents duplicate claim attempts for the same job from the observer.
 * @type {Set<string>}
 * @private
 */
const _claimInFlight = new Set();

// ---------------------------------------------------------------------------
// Concurrency checks
// ---------------------------------------------------------------------------

/**
 * Check whether this instance can accept a new job of the given type.
 *
 * 1. Global concurrency — per-instance in-memory count of running jobs.
 * 2. Per-type concurrency — cluster-wide via MongoDB count query.
 *
 * @param {string} jobName  The job type name.
 * @returns {Promise<boolean>}
 * @private
 */
async function canAcceptJob(jobName) {
  const config = getConfig();

  // Global concurrency: in-memory count for this instance
  if (_runningJobs.size >= config.concurrency) {
    return false;
  }

  // Per-type concurrency: cluster-wide via MongoDB
  const definition = getJobDefinition(jobName);
  if (definition && definition.concurrency !== Infinity) {
    const typeRunning = await JobsCollection.rawCollection().countDocuments({
      name: jobName,
      status: 'running',
    });
    if (typeRunning >= definition.concurrency) {
      return false;
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Atomic claiming
// ---------------------------------------------------------------------------

/**
 * Attempt to atomically claim a job and execute it.
 *
 * Uses `rawCollection().findOneAndUpdate()` to guarantee only one instance
 * wins the race.  If claiming succeeds the job is executed immediately.
 *
 * @param {string} jobId    The `_id` of the job to claim.
 * @param {string} [jobName]  If known (from observer/polling), skip a DB
 *   round-trip to look up the job name for concurrency checks.
 * @returns {Promise<void>}
 * @private
 */
export async function claimAndExecute(jobId, jobName) {
  // Guard: don't claim if the engine has been stopped (unless called directly
  // via executeNow in manual test mode).
  const config = getConfig();
  if (!_engineRunning && config.testMode !== 'manual') return;

  // Resolve the job name for concurrency checks.  If the caller already
  // knows it (observer / polling), we skip the extra DB fetch.
  if (!jobName) {
    const jobDoc = await JobsCollection.findOneAsync(jobId, {
      fields: { name: 1 },
    });
    if (!jobDoc) return;
    jobName = jobDoc.name;
  }

  if (!(await canAcceptJob(jobName))) return;

  const runId = Random.id();
  const now = new Date();

  let result;
  try {
    result = await JobsCollection.rawCollection().findOneAndUpdate(
      { _id: jobId, status: 'ready', claimedBy: null },
      {
        $set: {
          status: 'running',
          claimedBy: config.instanceId,
          claimedAt: now,
          heartbeatAt: now,
          startedAt: now,
          runId,
        },
        $inc: { attempts: 1 },
      },
      { returnDocument: 'after' }
    );
  } catch (err) {
    console.error('[Jobs] Error claiming job', jobId, err);
    return;
  }

  // Handle both driver result shapes: `{ value: doc }` or doc directly
  const claimed = result && (result.value != null ? result.value : result);
  if (!claimed || claimed.status !== 'running') return;

  // We successfully claimed this job — execute it.
  await executeJob(claimed);
}

// ---------------------------------------------------------------------------
// Job execution
// ---------------------------------------------------------------------------

/**
 * Execute a claimed job document.
 *
 * Sets up the abort controller, timeout, heartbeat, and runs the handler.
 * On completion or failure the job is marked accordingly and all timers
 * are cleaned up.
 *
 * @param {Object} jobDoc  The full job document (after claiming).
 * @returns {Promise<void>}
 * @private
 */
async function executeJob(jobDoc) {
  const config = getConfig();
  const definition = getJobDefinition(jobDoc.name);

  if (!definition) {
    console.error(`[Jobs] No definition found for job type "${jobDoc.name}" — marking failed.`);
    await handleFailure(jobDoc._id, new Error(`No definition registered for "${jobDoc.name}".`));
    return;
  }

  // --- Abort controller + timeout -----------------------------------------

  const abortController = new AbortController();
  const timeout = jobDoc.timeout || definition.timeout || 300000;
  const timeoutHandle = setTimeout(() => {
    abortController.abort();
  }, timeout);

  // --- Heartbeat -----------------------------------------------------------

  const heartbeatHandle = setInterval(async () => {
    try {
      await JobsCollection.updateAsync(jobDoc._id, {
        $set: { heartbeatAt: new Date() },
      });
    } catch (err) {
      // Non-fatal: log and continue — the stale-heartbeat detector will
      // eventually re-queue the job if heartbeats truly stop.
      console.error('[Jobs] Heartbeat update failed for', jobDoc._id, err);
    }
  }, config.heartbeatInterval);

  // --- Track the running job -----------------------------------------------

  _runningJobs.set(jobDoc._id, {
    heartbeatHandle,
    abortController,
    timeoutHandle,
  });

  // --- Emit 'started' lifecycle event --------------------------------------

  emit('started', jobDoc).catch(() => {});

  // --- Build the context object passed to the run function -----------------

  const jobContext = {
    id: jobDoc._id,
    name: jobDoc.name,
    attempts: jobDoc.attempts,
    runId: jobDoc.runId,
    signal: abortController.signal,
  };

  // --- Execute the handler -------------------------------------------------

  let returnValue;

  if (jobDoc.offload) {
    // --- Offload to worker-pool thread ------------------------------------
    const pool = getWorkerPool();
    if (!pool) {
      _cleanup(jobDoc._id);
      await markTerminalFailed(jobDoc._id, new Error(
        'Job requires offload: true but the worker-pool package is not available. ' +
        'Add worker-pool to your packages.'
      ));
      return;
    }

    try {
      // Dispatch to worker-pool. The handler receives (data, context) where
      // context is the hydrated thread-context bridge (Collections, Meteor).
      // Heartbeat and abort are managed by the main thread.
      returnValue = await pool.dispatch({
        handler: definition.run,
        data: jobDoc.data,
        timeout: timeout,
      });
    } catch (err) {
      _cleanup(jobDoc._id);
      // Deserialize FatalError: worker-pool preserves error.name across the
      // thread boundary, so we can detect Jobs.FatalError by name.
      if (err.name === 'Jobs.FatalError') {
        const fatalErr = new FatalError(err.message);
        fatalErr.stack = err.stack;
        await handleFailure(jobDoc._id, fatalErr);
      } else {
        await handleFailure(jobDoc._id, err);
      }
      return;
    }
  } else {
    // --- Main-thread execution --------------------------------------------
    try {
      returnValue = await definition.run(jobDoc.data, jobContext);
    } catch (err) {
      _cleanup(jobDoc._id);
      await handleFailure(jobDoc._id, err);
      return;
    }
  }

  _cleanup(jobDoc._id);
  await markCompleted(jobDoc._id, returnValue);
}

/**
 * Clean up timers and tracking state for a finished job.
 *
 * @param {string} jobId
 * @private
 */
function _cleanup(jobId) {
  const handle = _runningJobs.get(jobId);
  if (handle) {
    clearInterval(handle.heartbeatHandle);
    clearTimeout(handle.timeoutHandle);
    _runningJobs.delete(jobId);
  }
}

// ---------------------------------------------------------------------------
// Backoff calculation
// ---------------------------------------------------------------------------

/**
 * Calculate the backoff delay for a retry attempt.
 *
 * Supports three strategies:
 * - `'fixed'` — constant delay of `backoffDelay` ms.
 * - `'exponential'` (default) — exponential with full jitter:
 *   `Math.random() * Math.min(maxDelay, baseDelay * 2^(attempt-1))`
 * - Custom function — `backoff(attempt, error)` returns delay in ms.
 *
 * @param {Object|undefined} definition  The registered job definition.
 * @param {number} attempt               The current attempt number (1-based).
 * @param {Error}  error                 The error that triggered the retry.
 * @returns {number}  Delay in milliseconds before the next retry.
 * @private
 */
function calculateBackoff(definition, attempt, error) {
  if (!definition) return 1000;

  const { backoff, backoffDelay = 1000, backoffMaxDelay = 300000 } = definition;

  if (typeof backoff === 'function') {
    return backoff(attempt, error);
  }

  if (backoff === 'fixed') {
    return backoffDelay;
  }

  // exponential with full jitter (default), with minimum of backoffDelay
  const expDelay = backoffDelay * Math.pow(2, attempt - 1);
  const cappedDelay = Math.min(backoffMaxDelay, expDelay);
  const jitteredDelay = Math.random() * cappedDelay;
  return Math.max(backoffDelay, jitteredDelay);
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

/**
 * Build a structured `lastError` object from an Error instance.
 *
 * @param {Error} error  The error to serialize.
 * @returns {Object}  Structured error info for storage.
 * @private
 */
function buildLastError(error) {
  return {
    message: error.message || String(error),
    stack: error.stack || null,
    timestamp: new Date(),
    code: error.code || null,
    isTimeout: error && error.name === 'AbortError',
  };
}

// ---------------------------------------------------------------------------
// Failure handling (retry engine)
// ---------------------------------------------------------------------------

/**
 * Handle a job failure with retry logic.
 *
 * Decision flow:
 * 1. FatalError → immediately mark as terminal failure (skip all retries).
 * 2. attempts < maxAttempts → schedule a retry with backoff delay.
 * 3. attempts >= maxAttempts → mark as terminal failure (retries exhausted).
 *
 * @param {string} jobId  The job document _id.
 * @param {Error}  error  The error that caused the failure.
 * @returns {Promise<void>}
 * @private
 */
async function handleFailure(jobId, error) {
  const job = await JobsCollection.findOneAsync(jobId);
  if (!job) return;

  const definition = getJobDefinition(job.name);

  // FatalError → skip retries entirely
  if (error instanceof FatalError) {
    await markTerminalFailed(jobId, error);
    if (definition && definition.onFailure) {
      try { definition.onFailure(error, job); } catch (_) {}
    }
    return;
  }

  // Can retry?
  if (job.attempts < job.maxAttempts) {
    const delay = calculateBackoff(definition, job.attempts, error);
    const nextRetryAt = new Date(Date.now() + delay);

    try {
      await JobsCollection.rawCollection().findOneAndUpdate(
        { _id: jobId, status: 'running' },
        {
          $set: {
            status: 'pending',
            scheduledAt: nextRetryAt,
            nextRetryAt,
            source: 'retry',
            lastError: buildLastError(error),
            claimedBy: null,
            claimedAt: null,
            heartbeatAt: null,
            startedAt: null,
            runId: null,
          },
        }
      );
    } catch (err) {
      console.error('[Jobs] Error scheduling retry for job', jobId, err);
    }
    // Emit 'retrying' lifecycle event
    emit('retrying', job, error, nextRetryAt).catch(() => {});
    // Note: do NOT clear dedupKey on retry — the job is still "in progress"
    return;
  }

  // Exhausted retries → terminal failure
  await markTerminalFailed(jobId, error);
  if (definition && definition.onFailure) {
    try { definition.onFailure(error, job); } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// Terminal status transitions
// ---------------------------------------------------------------------------

/**
 * Mark a job as completed.
 *
 * Clears the dedupKey and invokes the per-type `onComplete` callback if
 * one is registered.
 *
 * @param {string} jobId         The job document _id.
 * @param {*}      returnValue   The value returned by the run function.
 * @returns {Promise<void>}
 * @private
 */
async function markCompleted(jobId, returnValue) {
  let job;
  try {
    const result = await JobsCollection.rawCollection().findOneAndUpdate(
      { _id: jobId, status: 'running' },
      {
        $set: {
          status: 'completed',
          result: returnValue !== undefined ? returnValue : null,
          completedAt: new Date(),
        },
        $unset: { dedupKey: 1 },
      },
      { returnDocument: 'after' }
    );
    job = result && (result.value != null ? result.value : result);
  } catch (err) {
    console.error('[Jobs] Error marking job completed', jobId, err);
  }

  if (job) {
    emit('completed', job).catch(() => {});
    const definition = getJobDefinition(job.name);
    if (definition && definition.onComplete) {
      try { definition.onComplete(returnValue, job); } catch (_) {}
    }
  }
}

/**
 * Mark a job as terminally failed (no more retries).
 *
 * Stores error details in `lastError` and clears the dedupKey so that
 * a new job with the same logical key can be enqueued.
 *
 * @param {string} jobId   The job document _id.
 * @param {Error}  error   The error that caused the failure.
 * @returns {Promise<void>}
 * @private
 */
async function markTerminalFailed(jobId, error) {
  try {
    await JobsCollection.rawCollection().findOneAndUpdate(
      { _id: jobId, status: 'running' },
      {
        $set: {
          status: 'failed',
          failedAt: new Date(),
          lastError: buildLastError(error),
        },
        $unset: { dedupKey: 1 },
      }
    );
  } catch (err) {
    console.error('[Jobs] Error marking job failed', jobId, err);
  }

  // Emit 'failed' lifecycle event
  try {
    const job = await JobsCollection.findOneAsync(jobId);
    if (job) {
      emit('failed', job).catch(() => {});
    }
  } catch (_) {
    // Non-critical
  }
}

// ---------------------------------------------------------------------------
// Stalled job detection (leader only)
// ---------------------------------------------------------------------------

/**
 * Scan for stalled jobs (running but heartbeat has exceeded the threshold)
 * and either reset them for retry or mark them as failed.
 *
 * A job is considered stalled when `heartbeatAt < (now - stalledThreshold)`.
 *
 * - If `attempts < maxAttempts` → reset to 'ready' (will be picked up again).
 * - If `attempts >= maxAttempts` → mark as 'failed' with a STALLED error.
 *
 * Only the leader instance runs this scan.
 *
 * @returns {Promise<void>}
 * @private
 */
async function detectStalledJobs() {
  const config = getConfig();
  const threshold = new Date(Date.now() - config.stalledThreshold);

  let stalledJobs;
  try {
    stalledJobs = await JobsCollection.rawCollection().find({
      status: 'running',
      heartbeatAt: { $lt: threshold },
    }).toArray();
  } catch (err) {
    console.error('[Jobs] Error querying stalled jobs:', err);
    return;
  }

  for (const job of stalledJobs) {
    try {
      const stalledError = new Error('Job stalled — heartbeat timeout exceeded');
      stalledError.code = 'STALLED';
      stalledError.name = 'AbortError';

      if (job.attempts >= job.maxAttempts) {
        // Exhausted retries → mark failed
        await JobsCollection.rawCollection().findOneAndUpdate(
          { _id: job._id, status: 'running' },
          {
            $set: {
              status: 'failed',
              failedAt: new Date(),
              lastError: buildLastError(stalledError),
            },
            $unset: { dedupKey: 1 },
          }
        );
      } else {
        // Can retry → reset to ready
        await JobsCollection.rawCollection().findOneAndUpdate(
          { _id: job._id, status: 'running' },
          {
            $set: {
              status: 'ready',
              lastError: buildLastError(stalledError),
              ...RESET_CLAIM_FIELDS,
            },
          }
        );
      }
      // Emit 'stalled' lifecycle event
      emit('stalled', job).catch(() => {});
    } catch (err) {
      console.error('[Jobs] Error handling stalled job', job._id, err);
    }
  }
}

/**
 * Start the stalled job detection loop (leader only).
 *
 * Runs every `stalledThreshold / 2` so that stalled jobs are detected
 * within one full threshold window.
 *
 * @private
 */
function _startStalledDetection() {
  _stopStalledDetection();
  const config = getConfig();
  const interval = Math.max(Math.floor(config.stalledThreshold / 2), 5000);
  _stalledInterval = setInterval(detectStalledJobs, interval);
  // Run once immediately on leader acquisition.
  detectStalledJobs();
}

/**
 * Stop the stalled job detection loop.
 * @private
 */
function _stopStalledDetection() {
  if (_stalledInterval != null) {
    clearInterval(_stalledInterval);
    _stalledInterval = null;
  }
}

// ---------------------------------------------------------------------------
// Retention cleanup (leader only)
// ---------------------------------------------------------------------------

/**
 * Remove old completed, failed, and cancelled jobs beyond the configured
 * retention period.
 *
 * Only the leader instance runs this cleanup.
 *
 * @returns {Promise<void>}
 * @private
 */
async function cleanupRetention() {
  const config = getConfig();
  const period = config.retentionPeriod;

  if (!period || period <= 0) return;

  const cutoff = new Date(Date.now() - period);

  try {
    await JobsCollection.rawCollection().deleteMany({
      $or: [
        { status: 'completed', completedAt: { $lt: cutoff } },
        { status: 'failed', failedAt: { $lt: cutoff } },
        { status: 'cancelled', cancelledAt: { $lt: cutoff } },
      ],
    });
  } catch (err) {
    console.error('[Jobs] Error cleaning up old jobs:', err);
  }
}

/** @type {number} Retention cleanup interval: once per hour. */
const RETENTION_CLEANUP_INTERVAL = 60 * 60 * 1000;

/**
 * Start the retention cleanup loop (leader only).
 * @private
 */
function _startRetentionCleanup() {
  _stopRetentionCleanup();
  _retentionInterval = setInterval(cleanupRetention, RETENTION_CLEANUP_INTERVAL);
  // Run once immediately on leader acquisition.
  cleanupRetention();
}

/**
 * Stop the retention cleanup loop.
 * @private
 */
function _stopRetentionCleanup() {
  if (_retentionInterval != null) {
    clearInterval(_retentionInterval);
    _retentionInterval = null;
  }
}

// ---------------------------------------------------------------------------
// Pending → Ready promotion (leader only)
// ---------------------------------------------------------------------------

/**
 * Promote all pending jobs whose `scheduledAt` has arrived to 'ready'.
 *
 * Only the leader instance runs this scan.
 *
 * @returns {Promise<void>}
 * @private
 */
async function promotePendingJobs() {
  try {
    await JobsCollection.rawCollection().updateMany(
      { status: 'pending', scheduledAt: { $lte: new Date() } },
      { $set: { status: 'ready' } }
    );
  } catch (err) {
    console.error('[Jobs] Error promoting pending jobs:', err);
  }
}

/**
 * Start the pending→ready promotion loop.
 * @private
 */
function _startPromotion() {
  _stopPromotion();
  _promotionInterval = setInterval(promotePendingJobs, 1000);
  // Run once immediately so we don't wait a full second on leader acquisition.
  promotePendingJobs();
}

/**
 * Stop the pending→ready promotion loop.
 * @private
 */
function _stopPromotion() {
  if (_promotionInterval != null) {
    clearInterval(_promotionInterval);
    _promotionInterval = null;
  }
}

// ---------------------------------------------------------------------------
// Reactive observer + polling fallback
// ---------------------------------------------------------------------------

/**
 * Start the oplog-driven reactive observer on `{ status: 'ready' }`.
 *
 * The observer is a wake-up signal only.  Actual concurrency enforcement
 * happens in `canAcceptJob` / `claimAndExecute`.
 *
 * @private
 */
function _startObserver() {
  _stopObserver();

  _observer = JobsCollection.find(
    { status: 'ready' },
    { fields: { _id: 1, name: 1, scheduledAt: 1 } }
  ).observe({
    added(job) {
      // `observe.added` is synchronous — we must not await here.
      // Guard against duplicate in-flight claims for the same job.
      if (_claimInFlight.has(job._id)) return;
      // Guard against exceeding global concurrency during initial observer burst.
      // Re-fetch config each time so runtime reconfiguration is respected.
      if (_runningJobs.size + _claimInFlight.size >= getConfig().concurrency) return;
      _claimInFlight.add(job._id);

      // Fire-and-forget async claim attempt.  Pass job.name to skip
      // the extra DB lookup inside claimAndExecute.
      Promise.resolve().then(async () => {
        try {
          await claimAndExecute(job._id, job.name);
        } catch (err) {
          console.error('[Jobs] Observer claimAndExecute error:', err);
        } finally {
          _claimInFlight.delete(job._id);
        }
      });
    },
  });
}

/**
 * Stop the reactive observer.
 * @private
 */
function _stopObserver() {
  if (_observer != null) {
    _observer.stop();
    _observer = null;
  }
}

/**
 * Start the polling fallback for environments without oplog tailing.
 *
 * Queries for ready jobs and attempts to claim each one.
 *
 * @private
 */
function _startPolling() {
  _stopPolling();

  const config = getConfig();
  _pollInterval = setInterval(async () => {
    if (!_engineRunning) return;

    try {
      const readyJobs = await JobsCollection.find(
        { status: 'ready' },
        {
          fields: { _id: 1, name: 1 },
          sort: { scheduledAt: 1 },
          limit: config.concurrency,
        }
      ).fetchAsync();

      const claims = [];
      for (const job of readyJobs) {
        if (!_engineRunning) break;
        if (_claimInFlight.has(job._id)) continue;
        _claimInFlight.add(job._id);

        claims.push(
          claimAndExecute(job._id, job.name)
            .catch(err => console.error('[Jobs] Polling claimAndExecute error:', err))
            .finally(() => _claimInFlight.delete(job._id))
        );
      }
      await Promise.all(claims);
    } catch (err) {
      console.error('[Jobs] Polling query error:', err);
    }
  }, config.pollInterval);
}

/**
 * Stop the polling fallback.
 * @private
 */
function _stopPolling() {
  if (_pollInterval != null) {
    clearInterval(_pollInterval);
    _pollInterval = null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start the execution engine.
 *
 * - Starts the reactive observer for `{ status: 'ready' }`.
 * - Starts the polling fallback for no-oplog deployments.
 * - Wires the leader callbacks for pending→ready promotion, cron scheduling,
 *   stalled job detection, and retention cleanup.
 *
 * Safe to call multiple times — subsequent calls are no-ops while running.
 */
export function startExecutionEngine() {
  if (_engineRunning) return;

  const config = getConfig();

  // In 'inline' mode, no engine is needed — jobs execute synchronously.
  // In 'manual' mode, jobs are only executed via executeNow().
  if (config.testMode === 'inline' || config.testMode === 'manual') {
    return;
  }

  _engineRunning = true;

  // Start the reactive observer (oplog-driven pickup).
  _startObserver();

  // Start the polling fallback for environments without oplog.
  _startPolling();

  // Wire leader callbacks for pending→ready promotion, cron scheduling,
  // stalled detection, and retention cleanup.
  setOnLeaderAcquired(() => {
    _startPromotion();
    startCronScheduler();
    _startStalledDetection();
    _startRetentionCleanup();
  });

  setOnLeaderLost(() => {
    _stopPromotion();
    stopCronScheduler();
    _stopStalledDetection();
    _stopRetentionCleanup();
  });

  // If we are already the leader (engine started after leader election),
  // start promotion, cron, stalled detection, and retention immediately.
  if (isLeader()) {
    _startPromotion();
    startCronScheduler();
    _startStalledDetection();
    _startRetentionCleanup();
  }
}

/**
 * Stop the execution engine gracefully.
 *
 * 1. Stops the reactive observer (no new jobs accepted).
 * 2. Stops polling, promotion, cron, stalled detection, and retention cleanup.
 * 3. Waits up to `shutdownTimeout` for in-flight jobs to complete naturally.
 * 4. Force-aborts remaining jobs and returns them to 'ready' status so
 *    another instance can pick them up.
 *
 * @returns {Promise<void>}
 */
export async function stopExecutionEngine() {
  if (!_engineRunning) return;
  _engineRunning = false;

  // Stop new work from being picked up.
  _stopObserver();
  _stopPolling();
  _stopPromotion();
  stopCronScheduler();
  _stopStalledDetection();
  _stopRetentionCleanup();

  const config = getConfig();
  const deadline = Date.now() + config.shutdownTimeout;

  // Wait for running jobs to finish naturally (up to shutdownTimeout).
  while (_runningJobs.size > 0 && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 500));
  }

  // Force-abort remaining jobs and mark them back to 'ready' so they
  // can be picked up by another instance.
  for (const [jobId, handle] of _runningJobs) {
    handle.abortController.abort();
    clearInterval(handle.heartbeatHandle);
    clearTimeout(handle.timeoutHandle);

    // Return to queue
    try {
      await JobsCollection.rawCollection().findOneAndUpdate(
        { _id: jobId, status: 'running' },
        {
          $set: {
            status: 'ready',
            ...RESET_CLAIM_FIELDS,
          },
        }
      );
    } catch (err) {
      console.error('[Jobs] Error returning job to queue on shutdown', jobId, err);
    }
  }
  _runningJobs.clear();

  _claimInFlight.clear();

  // Drain and terminate the worker pool if it was created.
  if (_pool) {
    try {
      await _pool.drain();
      await _pool.terminate();
    } catch (err) {
      console.error('[Jobs] Error shutting down worker pool:', err);
    }
    _pool = null;
    _workerPoolAvailable = null;
  }
}

/**
 * Returns the number of jobs currently running on this instance.
 * Useful for diagnostics and testing.
 *
 * @returns {number}
 */
export function getRunningJobCount() {
  return _runningJobs.size;
}

/**
 * Returns the set of job IDs currently running on this instance.
 * Useful for testing and diagnostics.
 *
 * @returns {Set<string>}
 */
export function getRunningJobIds() {
  return new Set(_runningJobs.keys());
}

/**
 * Abort a job running on this instance and clean up its timers.
 *
 * Called by `cancelJob` to stop in-memory execution when the cancelled job
 * is running on the local instance.  If the job is on a different instance,
 * this is a no-op (the stalled detector will clean it up remotely).
 *
 * @param {string} jobId  The job document _id.
 * @returns {boolean}  `true` if the job was found and aborted locally.
 */
export function abortLocalJob(jobId) {
  const handle = _runningJobs.get(jobId);
  if (!handle) return false;
  handle.abortController.abort();
  _cleanup(jobId);
  return true;
}
