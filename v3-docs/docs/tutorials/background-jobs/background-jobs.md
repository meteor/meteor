# Background Jobs

After reading this guide, you'll know:

1. Which background job options exist for Meteor 3 apps and what each one needs.
2. How each option behaves when several app instances run the same code.
3. How a recurring job runs once, not once per instance, when you scale out.

Meteor has no built-in job queue. Scheduled and background work runs through community packages or general Node.js libraries. This page presents the common options side by side. It does not rank them: the right one depends on the infrastructure you already run and on what a lost or duplicated run costs your app.

## What changes with several instances

A `Meteor.setInterval` in server code runs in every instance of your app. With one instance that is fine. With two or more, every instance runs the job, so emails are sent twice and reports are generated twice. Before choosing a tool, answer three questions:

- **Who claims a run?** Something shared (a database document, a lock, a unique index) must decide which instance runs each job or each scheduled time.
- **What happens if an instance dies mid-job?** The run is either lost (at-most-once) or run again by another instance (at-least-once). At-least-once needs jobs that are safe to run twice.
- **Are failures retried?** Some tools retry a job that throws, some record the error and wait for the next scheduled time.

If you run [several Meteor apps](/tutorials/multiple-meteor-apps/index) on one database, also decide which app owns the scheduled jobs. Running heavy jobs in a [separate app](/performance/performance-improvement#reoccurring-jobs) keeps them away from user-facing servers.

## The options

The facts below come from each project's source and README as of November 2026. Check the project before you depend on a detail.

| Option | Kind | Needs | Who runs a job with several instances | Instance dies mid-job | Failed job | Declared Meteor 3 support |
|---|---|---|---|---|---|---|
| [`msavin:sjobs`](#msavin-sjobs) | Job queue (Atmosphere) | MongoDB | One elected server runs all queues; two can overlap during election or takeover | Job stays pending and runs again on the next active server | Retried when a server's queues first run as the active server | 5.0.0, `versionsFrom` `3.0.1` |
| [`wildhart:jobs`](#wildhart-jobs) | Job queue (Atmosphere) | MongoDB | One elected server runs all queues; two can overlap during takeover | Lost by default; opt-in requeue | `retries` option, default 0 | 2.2.2, `versionsFrom` `3.0` |
| [`quave:synced-cron`](#quave-synced-cron) | Cron scheduler (Atmosphere) | MongoDB | First instance to record each scheduled time (with the default `persist: true`) | Later runs of that job are skipped until cleanup or the history TTL | Error recorded, no retry | 2.4.0, `versionsFrom` `3.0.3` |
| [`ostrio:cron-jobs`](#ostrio-cron-jobs-josk) / `josk` | Task scheduler (Atmosphere and npm) | MongoDB, Redis or PostgreSQL | Storage lease and atomic claim per run | Intervals rerun after `zombieTime`; one-shot tasks are lost | Error reported, interval continues | 6.5.0, `versionsFrom` `3.2` |
| [Agenda](#agenda) | Job queue (npm) | MongoDB, PostgreSQL or Redis backend | Lock on the job, valid for `lockLifetime` | Next run already saved (usual recurring job): interrupted run not repeated, next run waits for the lock to expire; no next run (one-shot job, final run of a bounded schedule): can run again after the lock expires | Opt-in `backoff` | Node.js library, no Meteor declaration |
| [BullMQ](#bullmq) | Job queue (npm) | Redis | Worker lock on the job, renewed while it runs | Stalled job moved back to waiting and processed again | `attempts` greater than 1, optional `backoff` | Node.js library, no Meteor declaration |

### `msavin:sjobs`

[Steve Jobs](https://github.com/msavin/SteveJobs) stores jobs, their history and results in MongoDB, with no other dependency. You register job functions and schedule them like method calls (`Jobs.register`, `Jobs.run`). A recurring job replicates or reschedules itself at the end of each run, and `Jobs.run(name, { singular: true })` at startup creates the first one.

- **Several instances:** servers ping a `jobs_dominator_3` collection; the most recent one is active and runs the queues, and another server takes over when the active one has not pinged for `maxWait` (5 minutes by default). Becoming active is a read followed by an upsert, not an atomic claim, and the queue fetches due jobs without locking them, so two servers can run jobs, including the same job, while an election or takeover overlaps. `singular` checks for an existing job before inserting, so concurrent `Jobs.run` calls at startup can still create two. In development mode (`meteor run`) every server treats itself as active unless you set `disableDevelopmentMode: true`.
- **Crashes and failures:** a job has no running state, so a job interrupted by a crash is still pending and runs again on the next active server. A job that throws is marked as failed. When a server's queues first run as the active server (after a restart or a takeover), they pick up failed jobs that did not fail on that server.
- **Meteor 3:** version 5.0.0 is async and declares `api.versionsFrom(['2.8.1', '3.0.1'])`.

### `wildhart:jobs`

[`wildhart:jobs`](https://github.com/wildhart/meteor.jobs) has an API inspired by `msavin:sjobs` and stores jobs in MongoDB. Instead of polling, it sets one timer for the next due job. A recurring job calls `this.reschedule()` inside its function, started once with `Jobs.run(name, { singular: true })`.

- **Several instances:** jobs run on the one server in control of the queue, chosen through a shared MongoDB document; another server takes control after `maxWait` (5 minutes by default). Taking control is an upsert of that document, not a compare-and-set, so two servers can both run jobs until they observe each other's ping. `singular` checks for a pending job before inserting, so concurrent `Jobs.run` calls can still create two. `dontRunJobs: true` keeps the queue off servers that should only schedule jobs. Two servers started with the same `setServerId` both run every job.
- **Crashes and failures:** a job is marked `executing` before it runs. By default a job interrupted by a crash stays `executing` and never runs again (at-most-once). `requeueOnTakeover` and `maxExecutionTime` requeue such jobs (at-least-once). The `retries` and `retryIn` options of `Jobs.run` retry a job that throws; the default is no retry.
- **Meteor 3:** the 2.x line (2.2.2) is async-only and declares `api.versionsFrom(['2.8.1', '3.0'])`. For Fibers-based apps, the same repository publishes `wildhart:jobs-fibers`.

### `quave:synced-cron`

[`quave:synced-cron`](https://github.com/quavedev/meteor-packages/tree/main/synced-cron) is the maintained replacement for `percolate:synced-cron`. It schedules named jobs with [later.js](https://github.com/breejs/later) expressions (`SyncedCron.add`, `SyncedCron.start`) and records each run in a `cronHistory` collection.

- **Several instances:** every instance runs the schedule, and each one inserts a history document for the scheduled time. A unique index on `{ intendedAt, name }` lets only the first insert succeed, so one instance runs each scheduled time. This needs the job's default `persist: true`; with `persist: false` nothing is recorded and every instance runs the job. By default a run is also skipped while an earlier run of the same job has no `finishedAt` (`allowParallelExecution`, `timeoutToConsiderRunningForParallelExecution`).
- **Crashes and failures:** on `SIGTERM` and `SIGINT` the package marks its running jobs as terminated and then calls `process.exit()` (set `noProcessExit: true` to leave shutdown to your app). After a hard crash the run keeps no `finishedAt`, so later runs of that job are skipped until an instance starts and cleans up runs older than `blockedJobTimeoutMs` (30 minutes by default), or until the history's TTL index (`collectionTTL`, two days by default) removes the record. A job that throws has its error stored in the history and passed to `onError`; it runs again at its next scheduled time, not before.
- **Meteor 3:** version 2.4.0 declares `api.versionsFrom(['2.12', '3.0.3'])`. The [migration guide](https://v3-migration-docs.meteor.com/guide/package-replacements#scheduling-background-jobs) maps `percolate:synced-cron` to it.

### `ostrio:cron-jobs` (`josk`)

[JoSk](https://github.com/veliovgroup/josk) is a task manager that mimics `setTimeout`, `setInterval` and `setImmediate`, with a unique id per task. It is published on npm as `josk` and on Atmosphere as `ostrio:cron-jobs`. Storage is an adapter: MongoDB, Redis or PostgreSQL. In Meteor, the MongoDB adapter can use the app's database through `MongoInternals.defaultRemoteCollectionDriver().mongo.db`. Its [Meteor guide](https://github.com/veliovgroup/josk/blob/master/docs/meteor.md) shows a small helper for cron expressions on top of `setInterval`.

- **Several instances:** every instance registers the same tasks, and storage-level leases and atomic claims give each due run to one instance.
- **Crashes and failures:** `setInterval` tasks are at-least-once: a task that does not finish within `zombieTime` (15 minutes by default) is run again by another instance. `setTimeout` and `setImmediate` tasks are removed before they run, so they are at-most-once. Errors thrown by a task go to the `onError` hook and complete that run. `shutdown()` hands unfinished intervals back to storage before exit.
- **Meteor 3:** version 6.5.0 declares `api.versionsFrom(['2.14', '3.2'])`, and its CI runs on Meteor 3.2, 3.3.1 and 3.4.

### Agenda

[Agenda](https://github.com/agenda/agenda) is a Node.js job scheduler installed from npm with a storage backend package: `@agendajs/mongo-backend`, `@agendajs/postgres-backend` or `@agendajs/redis-backend`. `agenda.define()` declares a job and `agenda.every()` schedules a recurring one. `every()` upserts a single job document by job name, so calling it again does not normally add a job. The MongoDB backend's default index on that collection is not unique, so instances calling `every()` for the same job at the same moment, before that job's document exists, can still create two documents.

- **Several instances:** an instance locks a job before it runs it, and other instances skip the job while the lock is valid (`lockLifetime`, 10 minutes by default). A handler that runs longer must call `job.touch()` to renew the lock; otherwise another instance can start the same job while the first is still running.
- **Crashes and failures:** a job unlocks when it finishes. Before the handler starts, Agenda saves the job's next run time. When there is a next run, which is the usual case for a recurring job, an interrupted run is not repeated if the process dies, but the job stays locked until the lock expires, so its next run can be delayed until then. When there is no next run, as for a one-shot job or the last run of a recurring job bounded by `endDate`, another instance can pick up the interrupted job and run it again once its lock expires. Failed jobs are retried only when the job is defined with a `backoff` strategy. `agenda.drain()` waits for running jobs on shutdown.
- **Meteor 3:** Agenda is a general Node.js library and makes no Meteor-specific claim. Version 6 is ESM-only and requires Node.js 18 or later.

### BullMQ

[BullMQ](https://docs.bullmq.io) is a Node.js queue built on Redis, installed from npm. Workers process jobs from a queue; `queue.upsertJobScheduler()` creates or updates a recurring job, keyed by its scheduler id within the queue, so every instance can call it at startup without creating duplicates.

- **Several instances:** a worker locks the job it processes and renews the lock while it works.
- **Crashes and failures:** a job whose worker stops renewing the lock is marked as stalled and moved back to waiting, to be processed again by another worker, until it reaches the maximum stall count and fails. A worker whose event loop is blocked can lose the lock while its handler is still running, so the job can run twice. A job that throws is retried only when added with `attempts` greater than 1; `backoff` sets the delay between attempts and is optional.
- **Meteor 3:** BullMQ is a general Node.js library and makes no Meteor-specific claim.

## Example: one recurring job on two instances

The example below shows the core of what the options above do for a recurring job: every instance tries to claim the current time slot in MongoDB, and only the first claim succeeds. It uses only `meteor/mongo`. It is meant to show the mechanism, not to replace one of the options: it has no retries, no crash recovery and no job history beyond one document per run.

Save it as `server/jobs.js` and import it from your server entry point, for example with `import './jobs';` in `server/main.js`. If your app does not use the `mongo` package yet (apps created with `meteor create --minimal` don't), run `meteor add mongo`.

```js
// server/jobs.js
import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';

const JobRuns = new Mongo.Collection('jobRuns');
const EVERY = 60 * 60 * 1000; // one run per hour

async function sendHourlyReport(slot) {
  console.log(`Sending the report for ${slot.toISOString()}`);
}

async function runOncePerSlot(name, job) {
  const slot = new Date(Math.floor(Date.now() / EVERY) * EVERY);
  const _id = `${name}:${slot.toISOString()}`;

  try {
    // _id is unique, so only the first instance to insert it runs this slot.
    await JobRuns.insertAsync({ _id, startedAt: new Date() });
  } catch (error) {
    if (error.code === 11000) return; // another instance claimed this slot
    throw error;
  }

  try {
    await job(slot);
  } catch (error) {
    console.error(`${name} failed for ${slot.toISOString()}`, error);
  }
}

Meteor.startup(async () => {
  // Remove run documents after a week.
  await JobRuns.createIndexAsync({ startedAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

  // Every instance checks each minute; only one runs each hourly slot.
  Meteor.setInterval(() => {
    runOncePerSlot('hourlyReport', sendHourlyReport).catch(console.error);
  }, 60 * 1000);
});
```

To watch it, set `EVERY` to `10 * 1000` and the check to `1000`, then run two instances on one database. Start the first with `meteor run`, and a second copy of the app with `MONGO_URL=mongodb://127.0.0.1:3001/meteor meteor run --port 4000` so it uses the first one's database. Each slot is logged by one of the two terminals, never both.

Each slot runs at most once, as long as the claim is acknowledged by a majority of the replica set. Meteor sets no write concern of its own, so the database default applies: `w: "majority"` on most MongoDB 5.0+ deployments, but `w: 1` on some replica sets with arbiters (such as primary-secondary-arbiter), on MongoDB versions before 5.0, or when a custom default is configured. With `w: 1`, a failover can roll back an acknowledged claim, and another instance can then claim and run the same slot. What the example leaves out is what separates the options above:

- If the instance that claimed a slot crashes before the job finishes, that slot is not run again.
- If no instance is running during a slot, that slot is skipped.
- A job that throws is logged and waits for the next slot.
- Slots are fixed windows of time, not cron expressions.
