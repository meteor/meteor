/**
 * @module jobs/retry
 * @summary Manually retry a failed or cancelled job.
 *
 * Resets the job to `'ready'` status with zero attempts so it can be
 * picked up by the execution engine as a fresh execution.
 */

import { JobsCollection } from './collection.js';
import { getJobDefinition } from './registration.js';
import { deriveDedupKey } from './helpers.js';
import { DuplicateError } from './errors.js';

/**
 * Retry a failed or cancelled job.
 *
 * Rules:
 * - Only valid for jobs in `failed` or `cancelled` status.
 * - Resets `attempts` to 0 and clears all execution state.
 * - Restores the `dedupKey` if the job definition has a `unique` function.
 * - Does **not** consume the original retry budget — this is a fresh execution.
 *
 * @param {string} jobId  The job document _id.
 * @returns {Promise<string>}  The same `jobId`, for chaining convenience.
 * @throws {Error}  If the job is not found or is not in a retryable status.
 */
export async function retryJob(jobId) {
  const job = await JobsCollection.findOneAsync(jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found.`);
  }

  if (job.status !== 'failed' && job.status !== 'cancelled') {
    throw new Error(
      `Jobs.retry(): can only retry failed or cancelled jobs (got "${job.status}").`
    );
  }

  const definition = getJobDefinition(job.name);

  // Re-derive dedupKey if the definition has a unique function. If the
  // definition is unavailable or no longer declares `unique`, explicitly
  // unset dedupKey so a stale key from an earlier enqueue can't orphan the
  // unique-index slot on the newly-ready job.
  const dedupKey = definition ? deriveDedupKey(definition, job.data) : null;

  const update = {
    $set: {
      status: 'ready',
      attempts: 0,
      lastError: null,
      nextRetryAt: null,
      scheduledAt: new Date(),
      failedAt: null,
      completedAt: null,
      result: null,
      runId: null,
      claimedBy: null,
      claimedAt: null,
      heartbeatAt: null,
      startedAt: null,
      source: 'retry',
    },
  };
  if (dedupKey) {
    update.$set.dedupKey = dedupKey;
  } else {
    update.$unset = { dedupKey: 1 };
  }

  try {
    await JobsCollection.updateAsync(jobId, update);
  } catch (err) {
    if (err && err.code === 11000) {
      throw new DuplicateError(
        `Jobs.retry(): cannot restore dedupKey — an active job with the same key already exists.`
      );
    }
    throw err;
  }

  return jobId;
}
