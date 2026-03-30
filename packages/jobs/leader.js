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

// ---------------------------------------------------------------------------
// Event callbacks — set by other modules to react to leadership changes.
// ---------------------------------------------------------------------------

/**
 * Called when this instance becomes the leader.
 * Other modules can overwrite this to hook in behaviour (e.g. starting cron).
 * @type {Function}
 */
export let onLeaderAcquired = () => {};

/**
 * Called when this instance loses the leadership.
 * Other modules can overwrite this to hook in behaviour (e.g. stopping cron).
 * @type {Function}
 */
export let onLeaderLost = () => {};

/**
 * Allow external modules to set the onLeaderAcquired callback.
 * @param {Function} fn
 */
export function setOnLeaderAcquired(fn) {
  onLeaderAcquired = fn;
}

/**
 * Allow external modules to set the onLeaderLost callback.
 * @param {Function} fn
 */
export function setOnLeaderLost(fn) {
  onLeaderLost = fn;
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
 * @returns {Promise<boolean>} `true` if the lock is now held by this instance.
 * @private
 */
async function _tryAcquire() {
  const now = new Date();
  const config = getConfig();
  const expiresAt = new Date(now.getTime() + config.leaderTimeout);

  try {
    const result = await JobsLocksCollection.rawCollection().findOneAndUpdate(
      {
        _id: 'leader',
        $or: [
          { instanceId: config.instanceId }, // We already hold it (renewal)
          { expiresAt: { $lt: now } },       // Expired — available
        ],
      },
      {
        $set: {
          instanceId: config.instanceId,
          expiresAt,
          heartbeatAt: now,
          acquiredAt: now,
        },
      },
      { upsert: true, returnDocument: 'after' },
    );

    // findOneAndUpdate returns the document (or wraps it in `.value`
    // depending on driver version).  A successful acquisition/renewal
    // returns the document whose `instanceId` matches ours.
    const doc = result && (result.value != null ? result.value : result);
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
    const acquired = await _tryAcquire();
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

  try {
    onLeaderAcquired();
  } catch (err) {
    console.error('[Jobs] onLeaderAcquired callback error:', err);
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

  try {
    onLeaderLost();
  } catch (err) {
    console.error('[Jobs] onLeaderLost callback error:', err);
  }

  // Resume follower acquisition loop.
  _scheduleFollowerAttempt();
}

// ---------------------------------------------------------------------------
// Graceful shutdown handlers
// ---------------------------------------------------------------------------

/** @type {boolean} Whether SIGTERM/SIGINT handlers have been registered. */
let _signalHandlersInstalled = false;

/**
 * Handle SIGTERM/SIGINT — release the lock so a new leader can be elected
 * quickly.
 * @private
 */
async function _onShutdownSignal() {
  await stopLeaderElection();
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
