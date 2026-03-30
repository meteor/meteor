/**
 * @module jobs/cron
 * @summary Cron scheduling engine — leader-only timer management for
 * recurring jobs.
 *
 * When this instance becomes leader it loads every registered job that has
 * a `schedule` (cron expression), computes the next fire time via `croner`,
 * and sets an in-memory `setTimeout`.  When the timer fires it inserts a
 * ready job document with a deterministic dedup key, then schedules the
 * next timer.  On demotion all timers are cancelled.
 *
 * DST transitions are handled by `croner`'s built-in timezone support.
 * The dedup key (`cron:{name}:{isoFireTime}`) prevents duplicate
 * insertions during leader election races or fall-back overlaps.
 */

import { Cron } from 'croner';
import { JobsCollection } from './collection.js';
import { getScheduledJobs } from './registration.js';
import { baseJobFields } from './helpers.js';

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

/**
 * Map of job name -> setTimeout handle.
 * One entry per scheduled cron job while this instance is leader.
 * @type {Map<string, ReturnType<typeof setTimeout>>}
 * @private
 */
const _timers = new Map();

/**
 * Whether the cron scheduler is currently active (leader mode).
 * @type {boolean}
 * @private
 */
let _active = false;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the next fire time for a cron expression + timezone.
 *
 * @param {string} expression  Cron expression (5 or 6 fields).
 * @param {string|undefined} timezone  IANA timezone identifier.
 * @param {Date} [after]  Compute the next run *after* this date.  Defaults
 *   to the current time.
 * @returns {Date|null}  The next fire time, or `null` if the expression
 *   has no future occurrences (e.g. a one-shot cron with a past date).
 * @private
 */
function getNextFireTime(expression, timezone, after) {
  const opts = {};
  if (timezone) {
    opts.timezone = timezone;
  }
  const cron = new Cron(expression, opts);
  return cron.nextRun(after || new Date());
}

/**
 * Build a cron job document for insertion.
 *
 * @param {Object} jobDef    The registered job definition.
 * @param {Date}   fireTime  The canonical scheduled fire time.
 * @returns {Object}  A job document ready for `insertOne`.
 * @private
 */
function buildCronJobDoc(jobDef, fireTime) {
  return {
    ...baseJobFields(jobDef),
    name: jobDef.name,
    status: 'ready',
    data: {},
    scheduledAt: fireTime,
    cronSchedule: jobDef.schedule,
    timezone: jobDef.timezone || null,
    dedupKey: `cron:${jobDef.name}:${fireTime.toISOString()}`,
    onDuplicate: null,
    source: 'cron',
  };
}

/**
 * Insert a cron job document.  Silently ignores duplicate-key errors
 * (error code 11000) — another leader already inserted this exact
 * fire-time occurrence.
 *
 * @param {Object} doc  The job document.
 * @returns {Promise<boolean>}  `true` if inserted, `false` if deduplicated.
 * @private
 */
async function insertCronJob(doc) {
  try {
    await JobsCollection.rawCollection().insertOne(doc);
    return true;
  } catch (err) {
    if (err && err.code === 11000) {
      // Expected: another leader (or previous timer) already inserted this run.
      return false;
    }
    console.error(`[Jobs] Error inserting cron job "${doc.name}":`, err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Timer management
// ---------------------------------------------------------------------------

/**
 * Schedule the next timer for a given cron job definition.
 *
 * Computes the next fire time and sets a `setTimeout`.  When the timer
 * fires it inserts the job document, then recursively schedules the next.
 *
 * @param {Object} jobDef  The registered job definition.
 * @param {Date} [after]   Compute the next run after this date.
 * @private
 */
function scheduleNextRun(jobDef, after) {
  // Guard: if we've been stopped, don't schedule anything.
  if (!_active) return;

  const nextTime = getNextFireTime(jobDef.schedule, jobDef.timezone, after);
  if (!nextTime) {
    // No future runs — this expression is exhausted.
    _timers.delete(jobDef.name);
    return;
  }

  const delay = Math.max(nextTime.getTime() - Date.now(), 0);

  const handle = setTimeout(async () => {
    // Guard: check we're still the active leader.
    if (!_active) return;

    _timers.delete(jobDef.name);

    // 1. Insert the job document.
    const doc = buildCronJobDoc(jobDef, nextTime);
    await insertCronJob(doc);

    // 2. Schedule the next timer (after the fire time we just processed).
    scheduleNextRun(jobDef, nextTime);
  }, delay);

  _timers.set(jobDef.name, handle);
}

// ---------------------------------------------------------------------------
// Missed run detection
// ---------------------------------------------------------------------------

/**
 * Detect and insert catch-up runs for cron jobs that were missed while
 * no leader was active.
 *
 * For each scheduled job with `missedRun === 'run-once'`:
 * 1. Find the most recent cron-sourced document for this job name.
 * 2. Compute what the next fire time after that document's `scheduledAt`
 *    would have been.
 * 3. If that next fire time is in the past (i.e. it was missed), insert
 *    a single catch-up job document.
 *
 * @param {Object[]} scheduledJobs  Array of job definitions with `schedule`.
 * @returns {Promise<void>}
 * @private
 */
async function detectMissedRuns(scheduledJobs) {
  const now = new Date();

  for (const jobDef of scheduledJobs) {
    if (jobDef.missedRun !== 'run-once') continue;

    try {
      // Find the most recent cron-inserted job for this name.
      const lastRun = await JobsCollection.rawCollection().findOne(
        { name: jobDef.name, source: 'cron' },
        { sort: { scheduledAt: -1 }, projection: { scheduledAt: 1 } }
      );

      if (!lastRun) {
        // No previous cron run exists at all.  The first timer will fire
        // at the next scheduled time — no catch-up needed.
        continue;
      }

      // What would the next fire time have been after the last recorded run?
      const expectedNext = getNextFireTime(
        jobDef.schedule,
        jobDef.timezone,
        lastRun.scheduledAt
      );

      if (expectedNext && expectedNext.getTime() < now.getTime()) {
        // This run was missed.  Insert a single catch-up.
        const catchUpDoc = buildCronJobDoc(jobDef, expectedNext);
        await insertCronJob(catchUpDoc);
      }
    } catch (err) {
      console.error(
        `[Jobs] Error detecting missed runs for "${jobDef.name}":`,
        err
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start the cron scheduler.
 *
 * Called when this instance becomes the leader.  Loads all registered jobs
 * with a `schedule`, detects missed runs, and sets timers for the next
 * fire time of each.
 *
 * @returns {Promise<void>}
 */
export async function startCronScheduler() {
  // Prevent double-start.
  if (_active) return;
  _active = true;

  const scheduledJobs = getScheduledJobs();
  if (scheduledJobs.length === 0) return;

  // Warn about jobs without an explicit timezone.
  for (const jobDef of scheduledJobs) {
    if (!jobDef.timezone) {
      console.warn(
        `[Jobs] Cron job "${jobDef.name}" has no timezone set. ` +
        'Using the server\'s local timezone. Set a timezone explicitly to ' +
        'avoid surprises across DST transitions.'
      );
    }
  }

  // Detect and insert catch-up runs for any missed occurrences.
  await detectMissedRuns(scheduledJobs);

  // Schedule the next timer for each cron job.
  for (const jobDef of scheduledJobs) {
    if (!_active) break; // Guard against stop during async init.
    scheduleNextRun(jobDef);
  }
}

/**
 * Stop the cron scheduler.
 *
 * Cancels all in-memory timers.  Called when this instance loses leadership.
 */
export function stopCronScheduler() {
  _active = false;

  for (const [name, handle] of _timers) {
    clearTimeout(handle);
  }
  _timers.clear();
}
