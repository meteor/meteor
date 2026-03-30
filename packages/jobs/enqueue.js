/**
 * @module jobs/enqueue
 * @summary Core enqueue logic and deduplication handling for the jobs package.
 */

import ms from 'ms';
import { JobsCollection } from './collection.js';
import { getJobDefinition } from './registration.js';
import { DuplicateError } from './errors.js';
import { emit } from './events.js';
import { ACTIVE_STATUSES, deriveDedupKey, baseJobFields } from './helpers.js';
import { abortLocalJob, getRunningJobIds } from './execution.js';

/**
 * Compute the `scheduledAt` date from the options.
 *
 * @param {Object} options  The user-supplied options bag.
 * @returns {Date}  The resolved scheduled-at timestamp.
 * @throws {Error} If both `delay` and `scheduledAt` are provided, or if
 *   `delay` is an unparseable string.
 * @private
 */
export function resolveScheduledAt(options) {
  const { delay, scheduledAt } = options;

  if (delay != null && scheduledAt != null) {
    throw new Error(
      'Jobs.run(): "delay" and "scheduledAt" are mutually exclusive.'
    );
  }

  if (scheduledAt != null) {
    if (!(scheduledAt instanceof Date) || isNaN(scheduledAt.getTime())) {
      throw new Error(
        'Jobs.run(): "scheduledAt" must be a valid Date instance.'
      );
    }
    return scheduledAt;
  }

  if (delay != null) {
    let millis;
    if (typeof delay === 'number') {
      millis = delay;
    } else if (typeof delay === 'string') {
      millis = ms(delay);
      if (millis === undefined) {
        throw new Error(
          `Jobs.run(): unable to parse delay string "${delay}".`
        );
      }
    } else {
      throw new Error(
        'Jobs.run(): "delay" must be a number (ms) or a string parseable by the ms package.'
      );
    }

    return new Date(Date.now() + millis);
  }

  // No delay / scheduledAt — run immediately.
  return new Date();
}

/**
 * Build the job document ready for insertion.
 *
 * @param {string} name        Job name.
 * @param {Object} data        User payload.
 * @param {Object} definition  The full registered definition.
 * @param {Date}   scheduledAt Resolved scheduled-at date.
 * @param {string|null} dedupKey Dedup key (or null).
 * @returns {Object} The job document.
 * @private
 */
function buildJobDoc(name, data, definition, scheduledAt, dedupKey) {
  const base = baseJobFields(definition);
  const isFuture = scheduledAt.getTime() > base.createdAt.getTime();

  return {
    ...base,
    name,
    status: isFuture ? 'pending' : 'ready',
    data: data || {},
    scheduledAt,
    cronSchedule: null,
    timezone: null,
    dedupKey: dedupKey || null,
    onDuplicate: definition.onDuplicate || null,
    source: 'manual',
  };
}

/**
 * Handle the collision when a job with the same dedupKey already exists.
 *
 * @param {string} dedupKey      The dedup key that collided.
 * @param {string} onDuplicate   The collision policy ('skip' | 'replace' | 'error').
 * @param {Object} doc           The new job document that was attempted.
 * @returns {Promise<string>}    The job ID (existing or updated).
 * @throws {DuplicateError}      When onDuplicate is 'error'.
 * @private
 */
async function handleCollision(dedupKey, onDuplicate, doc) {
  const existing = await JobsCollection.findOneAsync({
    dedupKey,
    status: { $in: ACTIVE_STATUSES },
  });

  // If the original was removed between the insert attempt and now, retry
  // the insert.  This is a very narrow window, so we just return early
  // and let the caller re-attempt if needed.
  if (!existing) {
    return null; // signal to caller to retry
  }

  switch (onDuplicate) {
    case 'skip':
      return existing._id;

    case 'replace': {
      // Only replace pending/ready jobs.  Running jobs are treated as 'skip'.
      if (existing.status === 'running') {
        return existing._id;
      }

      if (existing.status === 'pending' || existing.status === 'ready') {
        const now = new Date();
        const isFuture = doc.scheduledAt.getTime() > now.getTime();

        await JobsCollection.updateAsync(existing._id, {
          $set: {
            data: doc.data,
            scheduledAt: doc.scheduledAt,
            status: isFuture ? 'pending' : 'ready',
          },
        });
      }
      return existing._id;
    }

    case 'error':
      throw new DuplicateError(
        `A job with dedupKey "${dedupKey}" already exists (jobId: ${existing._id}).`
      );

    default:
      // Treat unknown policies as 'skip' for safety.
      return existing._id;
  }
}

/**
 * Enqueue a job for execution.
 *
 * @param {string} name          Must be a registered job name.
 * @param {Object} [data={}]     User payload.
 * @param {Object} [options={}]  delay, scheduledAt.
 * @returns {Promise<string>}    The inserted (or existing) job ID.
 * @throws {Error}               If the job name is not registered.
 * @throws {DuplicateError}      If onDuplicate is 'error' and a dup exists.
 */
export async function enqueueJob(name, data = {}, options = {}) {
  // --- Validation ---
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error('Jobs.run(): "name" must be a non-empty string.');
  }

  const definition = getJobDefinition(name);
  if (!definition) {
    throw new Error(
      `Jobs.run(): "${name}" is not a registered job. Call Jobs.register() first.`
    );
  }

  if (data != null && typeof data !== 'object') {
    throw new Error('Jobs.run(): "data" must be an object or null.');
  }

  // --- Resolve scheduling ---
  const scheduledAt = resolveScheduledAt(options);

  // --- Dedup key ---
  const dedupKey = deriveDedupKey(definition, data || {});

  // --- Build document ---
  const doc = buildJobDoc(name, data || {}, definition, scheduledAt, dedupKey);

  // --- No dedup: simple insert ---
  if (!dedupKey) {
    await JobsCollection.insertAsync(doc);
    emit('enqueued', doc).catch(() => {});
    return doc._id;
  }

  // --- Dedup path ---

  // First, check for an existing active job with this dedup key.
  const existing = await JobsCollection.findOneAsync({
    dedupKey,
    status: { $in: ACTIVE_STATUSES },
  });

  if (existing) {
    const result = await handleCollision(dedupKey, definition.onDuplicate, doc);
    if (result !== null) return result;
    // Existing doc vanished between query and handleCollision — fall through to insert.
  }

  // No existing active job — try to insert.  The unique sparse index
  // on `dedupKey` is the ultimate safety net for race conditions.
  try {
    await JobsCollection.insertAsync(doc);
    emit('enqueued', doc).catch(() => {});
    return doc._id;
  } catch (err) {
    // MongoDB duplicate key error code.
    if (err && (err.code === 11000 || (err.writeErrors && err.writeErrors.some(e => e.code === 11000)))) {
      const result = await handleCollision(dedupKey, definition.onDuplicate, doc);
      // If handleCollision returns null, the conflicting doc was removed
      // between insert and lookup.  Retry the insert once.
      if (result === null) {
        await JobsCollection.insertAsync(doc);
        emit('enqueued', doc).catch(() => {});
        return doc._id;
      }
      return result;
    }
    throw err;
  }
}

/**
 * Cancel a single job by ID.
 *
 * Sets status to `'cancelled'` and clears the dedup key.
 * Only cancels jobs in `pending`, `ready`, or `running` status.
 *
 * @param {string} jobId  The job document _id.
 * @returns {Promise<boolean>}  `true` if cancelled, `false` if not found
 *   or already in a terminal state.
 */
export async function cancelJob(jobId) {
  const result = await JobsCollection.updateAsync(
    {
      _id: jobId,
      status: { $in: ACTIVE_STATUSES },
    },
    {
      $set: { status: 'cancelled', cancelledAt: new Date() },
      $unset: { dedupKey: 1 },
    }
  );

  if (result > 0) {
    abortLocalJob(jobId);
    const job = await JobsCollection.findOneAsync(jobId);
    if (job) emit('cancelled', job).catch(() => {});
  }

  return result > 0;
}

/**
 * Cancel all non-terminal jobs of a given type.
 *
 * @param {string} name  The job name.
 * @returns {Promise<number>}  The number of jobs cancelled.
 */
export async function cancelAllJobs(name) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error('Jobs.cancelAll(): "name" must be a non-empty string.');
  }

  // Snapshot locally running job IDs before the DB update.
  const localRunning = getRunningJobIds();

  const raw = JobsCollection.rawCollection();
  const result = await raw.updateMany(
    {
      name,
      status: { $in: ACTIVE_STATUSES },
    },
    {
      $set: { status: 'cancelled', cancelledAt: new Date() },
      $unset: { dedupKey: 1 },
    }
  );

  // Abort any locally running jobs of this name that were just cancelled.
  if (localRunning.size > 0 && result.modifiedCount > 0) {
    const cancelledLocal = await JobsCollection.find({
      _id: { $in: [...localRunning] },
      name,
      status: 'cancelled',
    }).fetchAsync();
    for (const job of cancelledLocal) {
      abortLocalJob(job._id);
      emit('cancelled', job).catch(() => {});
    }
  }

  return result.modifiedCount;
}

/**
 * Fetch a single job document by ID.
 *
 * @param {string} jobId  The job document _id.
 * @returns {Promise<Object|null>}  The job document or `null`.
 */
export async function getJob(jobId) {
  const doc = await JobsCollection.findOneAsync(jobId);
  return doc || null;
}

/**
 * Clear the dedup key for a job.
 *
 * Called when a job reaches a terminal state (completed, failed, cancelled)
 * so that a new job with the same logical key can be enqueued.
 *
 * @param {string} jobId  The job document _id.
 * @returns {Promise<void>}
 */
export async function clearDedupKey(jobId) {
  await JobsCollection.updateAsync(jobId, {
    $unset: { dedupKey: 1 },
  });
}
