/**
 * @module jobs/errors
 * @summary Custom error classes for the jobs package.
 */

/**
 * Throw inside a job handler to skip all remaining retries and
 * immediately mark the job as failed.
 */
export class FatalError extends Error {
  constructor(message) {
    super(message);
    this.name = 'Jobs.FatalError';
  }
}

/**
 * Thrown when a job is enqueued with `onDuplicate: 'error'` and a
 * job with the same `dedupKey` already exists.
 */
export class DuplicateError extends Error {
  constructor(message) {
    super(message);
    this.name = 'Jobs.DuplicateError';
  }
}
