/**
 * @module jobs/run-and-wait
 * @summary Enqueue a job and wait for its completion, failure, or cancellation.
 *
 * `runAndWait` enqueues via `Jobs.run()` and then observes the job document
 * for a terminal status.  The job may be executed on any instance in the
 * cluster — the caller simply waits for the result.
 */

import { JobsCollection } from './collection.js';
import { enqueueJob } from './enqueue.js';

/**
 * Default wait timeout: 5 minutes.
 * @private
 */
const DEFAULT_WAIT_TIMEOUT = 300000;

/**
 * Enqueue a job and return a promise that resolves with the job's result
 * (or rejects on failure/cancellation/timeout).
 *
 * Handles the race condition where the job may complete before the
 * observer starts by checking the document's initial state via the
 * `added` callback.
 *
 * @param {string} name          A registered job name.
 * @param {Object} [data={}]     User payload forwarded to the job handler.
 * @param {Object} [options={}]  Scheduling options (same as `Jobs.run()`),
 *   plus `waitTimeout` (ms, default 300000).
 * @returns {Promise<*>}  The value returned by the job handler.
 * @throws {Error}  If the job fails, is cancelled, or the wait times out.
 */
export async function runAndWait(name, data, options = {}) {
  const jobId = await enqueueJob(name, data, options);

  return new Promise((resolve, reject) => {
    let settled = false;

    function settle(fn, value) {
      if (settled) return;
      settled = true;
      try { clearTimeout(timeout); } catch (_) {}
      try { handle.stop(); } catch (_) {}
      fn(value);
    }

    function checkDoc(doc) {
      if (doc.status === 'completed') {
        settle(resolve, doc.result);
      } else if (doc.status === 'failed' || doc.status === 'cancelled') {
        settle(
          reject,
          new Error(
            (doc.lastError && doc.lastError.message) ||
              `Job ${jobId} ${doc.status}`
          )
        );
      }
    }

    const timeout = setTimeout(() => {
      settle(
        reject,
        new Error(`Jobs.runAndWait timed out for job ${jobId}`)
      );
    }, options.waitTimeout || DEFAULT_WAIT_TIMEOUT);

    const handle = JobsCollection.find(
      { _id: jobId },
      { fields: { status: 1, result: 1, lastError: 1 } }
    ).observe({
      // `added` fires with the initial document state — handles the race
      // where the job completes before the observer is established.
      added(doc) {
        checkDoc(doc);
      },

      changed(doc) {
        checkDoc(doc);
      },
    });
  });
}
