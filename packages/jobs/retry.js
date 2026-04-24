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
  if (!definition) {
    // Retrying a job whose type is no longer registered would produce an
    // immediate failure in executeJob (see execution.js where a missing
    // definition flips the job to failed). Surface that here so the caller
    // can re-register the job type before retrying, and so we don't have
    // to guess whether to preserve or clear the existing dedupKey on a
    // job whose contract we can't reason about.
    throw new Error(
      `Jobs.retry(): job type "${job.name}" is no longer registered; re-register before retrying.`
    );
  }

  // Re-derive dedupKey if the definition has a unique function. If the
  // definition no longer declares `unique`, explicitly unset dedupKey so a
  // stale key from an earlier enqueue can't orphan the unique-index slot
  // on the newly-ready job.
  const dedupKey = deriveDedupKey(definition, job.data);

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

  let modifiedCount;
  try {
    // Atomic compare-and-set on status — closes the TOCTOU window between
    // the findOneAsync above and this write. If a concurrent actor flipped
    // the job out of failed/cancelled (e.g. re-enqueued, started running),
    // this update matches zero documents and we report the race.
    modifiedCount = await JobsCollection.updateAsync(
      { _id: jobId, status: { $in: ['failed', 'cancelled'] } },
      update
    );
  } catch (err) {
    if (err && err.code === 11000) {
      throw new DuplicateError(
        `Jobs.retry(): cannot restore dedupKey — an active job with the same key already exists.`
      );
    }
    throw err;
  }

  if (!modifiedCount) {
    throw new Error(
      `Jobs.retry(): job ${jobId} is no longer in a retryable status; its state changed concurrently.`
    );
  }

  return jobId;
}
