/**
 * @module jobs/collection
 * @summary Collection setup and index creation for the jobs package.
 */

import { Mongo } from 'meteor/mongo';
import { Meteor } from 'meteor/meteor';

/**
 * Main jobs collection.
 *
 * Created via `new Mongo.Collection` so that the Meteor oplog driver can
 * observe it for real-time reactivity.
 */
export const JobsCollection = new Mongo.Collection('_jobs');

/**
 * Leader / distributed-lock collection.
 */
export const JobsLocksCollection = new Mongo.Collection('_jobs_locks');

/**
 * Create all required indexes.
 *
 * Called inside `Meteor.startup` so that the underlying Mongo driver is
 * guaranteed to be ready.  All indexes are created in the background so
 * they do not block application startup. Returns a promise that settles
 * once every index has been created (or rejected) so callers can surface
 * failures at startup.
 *
 * @returns {Promise<void[]>}
 * @private
 */
function ensureIndexes() {
  const jobs = JobsCollection.rawCollection();
  const locks = JobsLocksCollection.rawCollection();

  return Promise.all([
    // --- _jobs indexes ---

    // Pickup query: find ready jobs ordered by scheduledAt
    jobs.createIndex(
      { status: 1, scheduledAt: 1 },
      { background: true }
    ),

    // Per-type concurrency checks
    jobs.createIndex(
      { name: 1, status: 1 },
      { background: true }
    ),

    // Deduplication — partial index on string dedupKey values only.
    // A plain `sparse: true` index would still index explicit `null`
    // values, which collide on the non-dedup insert path in enqueue.js
    // (which writes `dedupKey: null`).
    jobs.createIndex(
      { dedupKey: 1 },
      {
        unique: true,
        background: true,
        partialFilterExpression: { dedupKey: { $type: 'string' } },
      }
    ),

    // Crash recovery — find jobs claimed by a specific instance
    jobs.createIndex(
      { claimedBy: 1, status: 1 },
      { background: true }
    ),

    // Retention cleanup — find completed jobs older than retention period
    jobs.createIndex(
      { status: 1, completedAt: 1 },
      { background: true }
    ),

    // Retention cleanup — failed jobs by failedAt
    jobs.createIndex(
      { status: 1, failedAt: 1 },
      { background: true }
    ),

    // Retention cleanup — cancelled jobs by cancelledAt
    jobs.createIndex(
      { status: 1, cancelledAt: 1 },
      { background: true }
    ),

    // Cron missed run detection — find most recent cron job by name
    jobs.createIndex(
      { name: 1, source: 1, scheduledAt: -1 },
      { background: true }
    ),

    // Stale heartbeat detection — status first (high selectivity equality match),
    // then heartbeatAt for the range scan.
    jobs.createIndex(
      { status: 1, heartbeatAt: 1 },
      { background: true }
    ),

    // --- _jobs_locks indexes ---

    // Lookup by instance
    locks.createIndex(
      { instanceId: 1 },
      { background: true }
    ),
  ]);
}

Meteor.startup(async () => {
  try {
    await ensureIndexes();
  } catch (err) {
    console.error('[Jobs] Failed to create indexes:', err);
  }
});
