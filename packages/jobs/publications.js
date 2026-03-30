/**
 * @module jobs/publications
 * @summary Reactive Meteor publications for the jobs package.
 *
 * All publications are gated by the `authorize` function in the package
 * configuration.  If no `authorize` function is configured, publications
 * return no data (secure by default).
 *
 * Publications:
 *   - `jobs.status`  — active jobs with minimal fields
 *   - `jobs.history` — terminal jobs by type, sorted, capped at 200
 *   - `jobs.job`     — single job by ID
 */

import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import { JobsCollection } from './collection.js';
import { getConfig } from './config.js';
import { ACTIVE_STATUSES, TERMINAL_STATUSES } from './helpers.js';

// ---------------------------------------------------------------------------
// jobs.status — Active jobs with minimal fields
// ---------------------------------------------------------------------------

Meteor.publish('jobs.status', function () {
  const config = getConfig();
  if (!config.authorize || !config.authorize(this.userId, this)) {
    return this.ready();
  }

  return JobsCollection.find(
    { status: { $in: ACTIVE_STATUSES } },
    { fields: { name: 1, status: 1, scheduledAt: 1, startedAt: 1 } }
  );
});

// ---------------------------------------------------------------------------
// jobs.history — Recent terminal jobs by type, sorted by completion time
// ---------------------------------------------------------------------------

Meteor.publish('jobs.history', function (options) {
  check(options, Match.Maybe({
    name: Match.Maybe(String),
    limit: Match.Maybe(Match.Where((v) => {
      check(v, Match.Integer);
      return v > 0;
    })),
  }));

  const { name, limit = 50 } = options || {};

  const config = getConfig();
  if (!config.authorize || !config.authorize(this.userId, this)) {
    return this.ready();
  }

  const query = { status: { $in: TERMINAL_STATUSES } };
  if (name) query.name = name;

  return JobsCollection.find(query, {
    sort: { createdAt: -1 },
    limit: Math.min(limit, 200),
  });
});

// ---------------------------------------------------------------------------
// jobs.job — Single job detail by ID
// ---------------------------------------------------------------------------

Meteor.publish('jobs.job', function (jobId) {
  check(jobId, String);

  const config = getConfig();
  if (!config.authorize || !config.authorize(this.userId, this)) {
    return this.ready();
  }

  return JobsCollection.find({ _id: jobId });
});
