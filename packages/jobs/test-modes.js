/**
 * @module jobs/test-modes
 * @summary Test mode helpers for the jobs package.
 *
 * Two test modes are supported:
 *
 * - `'inline'` — `Jobs.run()` executes the handler immediately on the main
 *   thread, bypassing the queue entirely.  Returns the handler's return value
 *   instead of a job ID.
 *
 * - `'manual'` — Jobs are enqueued normally (documents inserted into MongoDB)
 *   but never auto-picked up.  Use `Jobs.executeNow(jobId)` to trigger a
 *   specific job on demand.
 */

import { Random } from 'meteor/random';
import { getJobDefinition } from './registration.js';
import { claimAndExecute } from './execution.js';

/**
 * Execute a job handler inline (synchronously on the calling fiber/async
 * context).  No document is inserted, no queue is involved.
 *
 * Used when `testMode === 'inline'`.
 *
 * @param {string} name       A registered job name.
 * @param {Object} [data={}]  User payload forwarded to the job handler.
 * @returns {Promise<*>}  The value returned by the handler.
 * @throws {Error}  If the job name is not registered.
 */
export async function runInline(name, data) {
  const definition = getJobDefinition(name);
  if (!definition) {
    throw new Error(`Job "${name}" is not registered.`);
  }

  const abortController = new AbortController();
  const jobContext = {
    id: null,
    name,
    attempts: 1,
    runId: Random.id(),
    signal: abortController.signal,
  };

  return definition.run(data || {}, jobContext);
}

/**
 * Manually trigger execution of a specific job, bypassing the observer
 * and polling loop.
 *
 * Intended for `testMode === 'manual'`, but works in any mode.
 *
 * @param {string} jobId  The job document _id.
 * @returns {Promise<void>}
 */
export async function executeNow(jobId) {
  await claimAndExecute(jobId);
}
