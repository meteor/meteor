/**
 * @module jobs/helpers
 * @summary Shared constants and utilities for the jobs package.
 */

import { Random } from 'meteor/random';

// ---------------------------------------------------------------------------
// Status constants
// ---------------------------------------------------------------------------

/** Statuses for jobs that are still in-flight. */
export const ACTIVE_STATUSES = ['pending', 'ready', 'running'];

/** Statuses for jobs that have reached a terminal state. */
export const TERMINAL_STATUSES = ['completed', 'failed', 'cancelled'];

// ---------------------------------------------------------------------------
// Reset field sets
// ---------------------------------------------------------------------------

/**
 * Fields to reset when returning a job to 'ready' status
 * (stalled recovery, graceful shutdown, manual retry, etc.).
 */
export const RESET_CLAIM_FIELDS = {
  claimedBy: null,
  claimedAt: null,
  heartbeatAt: null,
  startedAt: null,
  runId: null,
};

// ---------------------------------------------------------------------------
// Dedup key derivation
// ---------------------------------------------------------------------------

/**
 * Derive the dedup key for a job, or `null` if the job definition does
 * not have a `unique` function.
 *
 * @param {Object} definition  The registered job definition.
 * @param {Object} data        The user-supplied job data.
 * @returns {string|null}
 */
export function deriveDedupKey(definition, data) {
  if (typeof definition.unique !== 'function') {
    return null;
  }
  const suffix = definition.unique(data);
  return `${definition.name}:${suffix}`;
}

// ---------------------------------------------------------------------------
// Base job document builder
// ---------------------------------------------------------------------------

/**
 * Build the common base fields shared by all job documents (manual enqueue
 * and cron insertion).  Callers spread these fields and override the
 * context-specific ones (status, source, dedupKey, etc.).
 *
 * @param {Object} definition  The registered job definition.
 * @returns {Object}  Base field set (does NOT include name, status, data,
 *   scheduledAt, dedupKey, source, cronSchedule, timezone, onDuplicate).
 */
export function baseJobFields(definition) {
  return {
    _id: Random.id(),
    result: null,
    offload: definition.offload,
    priority: 0,
    timeout: definition.timeout,
    attempts: 0,
    maxAttempts: definition.retries + 1,
    lastError: null,
    nextRetryAt: null,
    ...RESET_CLAIM_FIELDS,
    createdAt: new Date(),
    completedAt: null,
    failedAt: null,
    cancelledAt: null,
  };
}
