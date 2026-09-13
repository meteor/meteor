/**
 * @module jobs/leader
 * @summary Leader election via single-document lock in `_jobs_locks`.
 *
 * Uses `findOneAndUpdate` with `upsert: true` on a single document
 * (`_id: 'leader'`) to implement distributed leader election.  The lock
 * has a logical TTL via `expiresAt` — no MongoDB TTL index is used.
 *
 * Only one instance in the cluster holds the lock at any time.  The leader
 * renews the lock every `leaderRenewalInterval` (default 10 s).  Followers
 * attempt to acquire the lock every `leaderTimeout / 2` plus random jitter
 * (0–5 s).
 */

import { JobsLocksCollection } from './collection.js';
import { getConfig } from './config.js';
import { emit } from './events.js';
import { unwrapDriverResult } from './helpers.js';

// ---------------------------------------------------------------------------
// Event callbacks — set by other modules to react to leadership changes.
// ---------------------------------------------------------------------------

/**
 * Callbacks invoked when this instance becomes the leader.
 * Multiple modules can register callbacks (e.g. execution engine, cron).
 * @type {Function[]}
 * @private
 */
const _onLeaderAcquiredCallbacks = [];

/**
 * Callbacks invoked when this instance loses the leadership.
 * @type {Function[]}
 * @private
 */
const _onLeaderLostCallbacks = [];

/**
 * Register a callback to be invoked when this instance becomes leader.
 * @param {Function} fn
 * @returns {Function} A deregistration function — call it to remove the callback.
 */
export function setOnLeaderAcquired(fn) {
  _onLeaderAcquiredCallbacks.push(fn);
  return () => {
    const idx = _onLeaderAcquiredCallbacks.indexOf(fn);
    if (idx !== -1) _onLeaderAcquiredCallbacks.splice(idx, 1);
  };
}

/**
 * Register a callback to be invoked when this instance loses leadership.
 * @param {Function} fn
 * @returns {Function} A deregistration function — call it to remove the callback.
 */
export function setOnLeaderLost(fn) {
  _onLeaderLostCallbacks.push(fn);
  return () => {
    const idx = _onLeaderLostCallbacks.indexOf(fn);
    if (idx !== -1) _onLeaderLostCallbacks.splice(idx, 1);
  };
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

/** @type {boolean} Whether this instance currently holds the leader lock. */
let _isLeader = false;

/** @type {ReturnType<typeof setInterval>|null} Renewal timer (leader mode). */
let _renewalInterval = null;

/** @type {ReturnType<typeof setTimeout>|null} Follower acquisition timer. */
let _followerTimeout = null;

/** @type {boolean} Whether the election loop has been started. */
let _running = false;

// ---------------------------------------------------------------------------
// Lock operations
// ---------------------------------------------------------------------------

/**
 * Attempt to acquire or renew the leader lock.
 *
 * Two acquisition paths:
 *  1. **Fresh acquisition** — no lock document exists; upsert creates one.
 *  2. **Expired lock takeover** — document exists but `expiresAt < now`.
 *
 * When this instance already holds the lock (`instanceId` matches), the same
 * query acts as a renewal (extends `expiresAt`, updates `heartbeatAt`).
 *
 * @param {boolean} [renewal=false]  If `true`, this is a renewal — skip
 *   writing `acquiredAt` so it reflects the original acquisition time.
 * @returns {Promise<boolean>} `true` if the lock is now held by this instance.
 * @private
 */
async function _tryAcquire(renewal = false) {
  const now = new Date();
  const config = getConfig();
  const expiresAt = new Date(now.getTime() + config.leaderTimeout);

  const $set = {
    instanceId: config.instanceId,
    expiresAt,
    heartbeatAt: now,
  };

  // On fresh acquisition (or takeover of an expired lock), record the
  // acquisition time.  On renewal, leave it alone so it reflects when
  // this instance originally became leader.
  if (!renewal) {
    $set.acquiredAt = now;
  }

  try {
    const result = await JobsLocksCollection.rawCollection().findOneAndUpdate(
      {
        _id: 'leader',
        $or: [
          { instanceId: config.instanceId }, // We already hold it (renewal)
          { expiresAt: { $lt: now } },       // Expired — available
        ],
      },
      { $set },
      { upsert: true, returnDocument: 'after' },
    );

    // findOneAndUpdate returns the document (or wraps it in `.value`
    // depending on driver version).  A successful acquisition/renewal
    // returns the document whose `instanceId` matches ours.
    const doc = unwrapDriverResult(result);
    return !!(doc && doc.instanceId === config.instanceId);
  } catch (err) {
    // Duplicate key on upsert race — another instance won.
    if (err && err.code === 11000) {
      return false;
    }
    // Log unexpected errors but don't crash.
    console.error('[Jobs] Leader lock acquisition error:', err);
    return false;
  }
}

/**
 * Release the leader lock by setting `expiresAt` to a date in the past.
 *
 * Only releases if this instance currently holds the lock.
 *
 * @returns {Promise<void>}
 * @private
 */
async function _releaseLock() {
  const config = getConfig();
  try {
    await JobsLocksCollection.rawCollection().findOneAndUpdate(
      {
        _id: 'leader',
        instanceId: config.instanceId,
      },
      {
        $set: {
          expiresAt: new Date(0), // Epoch — effectively expired
        },
      },
    );
  } catch (err) {
    console.error('[Jobs] Error releasing leader lock:', err);
  }
}

// ---------------------------------------------------------------------------
// Leader / follower loops
// ---------------------------------------------------------------------------

/**
 * Start the renewal loop.  Called when this instance becomes leader.
 * @private
 */
function _startRenewal() {
  _stopRenewal();
  const config = getConfig();
  _renewalInterval = setInterval(async () => {
    const acquired = await _tryAcquire(/* renewal */ true);
    if (!acquired) {
      // Renewal failed — another instance took over.  Self-demote.
      _demote();
    }
  }, config.leaderRenewalInterval);
}

/**
 * Stop the renewal interval.
 * @private
 */
function _stopRenewal() {
  if (_renewalInterval != null) {
    clearInterval(_renewalInterval);
    _renewalInterval = null;
  }
}

/**
 * Schedule the next follower acquisition attempt.
 *
 * Uses `leaderTimeout / 2` plus random jitter (0–5 s) so that followers
 * don't all try at the same instant.
 * @private
 */
function _scheduleFollowerAttempt() {
  _cancelFollowerAttempt();
  if (!_running) return;

  const config = getConfig();
  const delay = (config.leaderTimeout / 2) + Math.random() * 5000;
  _followerTimeout = setTimeout(async () => {
    _followerTimeout = null;
    if (!_running) return;

    const acquired = await _tryAcquire();
    if (acquired) {
      _promote();
    } else {
      _scheduleFollowerAttempt();
    }
  }, delay);
}

/**
 * Cancel any pending follower acquisition timeout.
 * @private
 */
function _cancelFollowerAttempt() {
  if (_followerTimeout != null) {
    clearTimeout(_followerTimeout);
    _followerTimeout = null;
  }
}

/**
 * Transition to leader state.
 * @private
 */
function _promote() {
  if (_isLeader) return;
  _isLeader = true;
  _cancelFollowerAttempt();
  _startRenewal();

  emit('leader.acquired').catch(() => {});

  for (const fn of _onLeaderAcquiredCallbacks) {
    try {
      fn();
    } catch (err) {
      console.error('[Jobs] onLeaderAcquired callback error:', err);
    }
  }
}

/**
 * Transition to follower state.
 * @private
 */
function _demote() {
  if (!_isLeader) return;
  _isLeader = false;
  _stopRenewal();

  emit('leader.lost').catch(() => {});

  for (const fn of _onLeaderLostCallbacks) {
    try {
      fn();
    } catch (err) {
      console.error('[Jobs] onLeaderLost callback error:', err);
    }
  }

  // Resume follower acquisition loop.
  _scheduleFollowerAttempt();
}

// ---------------------------------------------------------------------------
// Graceful shutdown handlers
// ---------------------------------------------------------------------------

/** @type {boolean} Whether SIGTERM/SIGINT handlers have been registered. */
let _signalHandlersInstalled = false;

/** @type {number} Maximum time (ms) to wait for lock release before exiting. */
const SHUTDOWN_GRACE_MS = 5000;

/**
 * Handle SIGTERM/SIGINT — release the lock so a new leader can be elected
 * quickly, then exit the process.
 *
 * Awaits `stopLeaderElection()` with a bounded grace window so the lock
 * is released reliably even if Mongo is slow to respond. On timeout or
 * error we still call `process.exit(code)` so the process doesn't hang
 * (`process.on(...)` suppresses Node's default terminate action).
 *
 * @param {NodeJS.Signals} signal
 * @private
 */
async function _onShutdownSignal(signal) {
  const code = signal === 'SIGINT' ? 130 : 143;

  try {
    let timeoutHandle;
    const timeout = new Promise((resolve) => {
      timeoutHandle = setTimeout(() => {
        console.error(
          `[Jobs] Leader shutdown exceeded ${SHUTDOWN_GRACE_MS}ms grace window; exiting.`
        );
        resolve();
      }, SHUTDOWN_GRACE_MS);
      timeoutHandle.unref?.();
    });

    await Promise.race([
      stopLeaderElection().catch((err) => {
        console.error('[Jobs] Error releasing leader lock on shutdown:', err);
      }),
      timeout,
    ]);

    clearTimeout(timeoutHandle);
  } finally {
    process.exit(code);
  }
}

/**
 * Install process signal handlers (once).
 * @private
 */
function _installSignalHandlers() {
  if (_signalHandlersInstalled) return;
  _signalHandlersInstalled = true;

  process.on('SIGTERM', _onShutdownSignal);
  process.on('SIGINT', _onShutdownSignal);
}

/**
 * Remove process signal handlers.
 * Prevents handler accumulation across start/stop cycles (e.g. testing).
 * @private
 */
function _removeSignalHandlers() {
  if (!_signalHandlersInstalled) return;
  process.removeListener('SIGTERM', _onShutdownSignal);
  process.removeListener('SIGINT', _onShutdownSignal);
  _signalHandlersInstalled = false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Begin the leader election loop.
 *
 * Makes an immediate acquisition attempt.  If successful this instance
 * becomes the leader and starts the renewal loop.  Otherwise it enters
 * follower mode and retries periodically.
 *
 * Safe to call multiple times — subsequent calls are no-ops while running.
 *
 * @returns {Promise<void>}
 */
export async function startLeaderElection() {
  if (_running) return;
  _running = true;
  _installSignalHandlers();

  // Immediate first attempt.
  const acquired = await _tryAcquire();
  if (acquired) {
    _promote();
  } else {
    _scheduleFollowerAttempt();
  }
}

/**
 * Stop all election timers and, if this instance is leader, release the
 * lock immediately (setting `expiresAt` to the past so another instance
 * can take over quickly).
 *
 * @returns {Promise<void>}
 */
export async function stopLeaderElection() {
  if (!_running) return;
  _running = false;

  _cancelFollowerAttempt();

  if (_isLeader) {
    await _releaseLock();
    // _demote handles: _isLeader = false, _stopRenewal, emit, onLeaderLost.
    // _scheduleFollowerAttempt inside _demote is a no-op since _running = false.
    _demote();
  }

  _removeSignalHandlers();
}

/**
 * Returns whether this instance currently holds the leader lock.
 *
 * @returns {boolean}
 */
export function isLeader() {
  return _isLeader;
}
