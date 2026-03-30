# jobs

A distributed job queue for Meteor. Run background tasks, schedule recurring work with cron, and coordinate across multiple server instances -- all backed by MongoDB.

## Quick start

```js
import { Jobs } from 'meteor/jobs';

// 1. Register a job
Jobs.register({
  name: 'sendWelcomeEmail',
  run(data) {
    Email.send({
      to: data.email,
      subject: 'Welcome!',
      text: `Hey ${data.name}, glad to have you.`,
    });
  },
});

// 2. Run it
await Jobs.run('sendWelcomeEmail', { email: 'ada@example.com', name: 'Ada' });
```

That's it. The job gets inserted into MongoDB, picked up by whichever instance has capacity, and executed. If it fails, it retries automatically.

## Scheduling

Run a job later:

```js
await Jobs.run('cleanup', {}, { delay: '30m' });
await Jobs.run('report', {}, { scheduledAt: new Date('2025-01-01') });
```

Run a job on a cron schedule:

```js
Jobs.register({
  name: 'dailyDigest',
  schedule: '0 9 * * *',     // every day at 9am
  timezone: 'America/New_York',
  run() {
    // build and send the digest
  },
});
```

Missed a run because the server was down? Set `missedRun: 'run-once'` (the default) and it'll catch up with a single execution when the leader comes back.

## Retries and backoff

Jobs retry 3 times by default with exponential backoff:

```js
Jobs.register({
  name: 'callExternalApi',
  retries: 5,
  backoff: 'exponential',  // or 'fixed', or a custom function
  backoffDelay: 2000,       // base delay in ms
  backoffMaxDelay: 60000,   // cap for exponential growth
  run(data) {
    return HTTP.post(data.url, { data: data.payload });
  },
});
```

If a job should never retry (e.g. a payment that already went through), throw `Jobs.FatalError`:

```js
Jobs.register({
  name: 'chargeCard',
  run(data) {
    const result = PaymentService.charge(data.cardToken, data.amount);
    if (result.alreadyCharged) {
      throw new Jobs.FatalError('Card was already charged');
    }
    return result;
  },
});
```

## Deduplication

Prevent duplicate jobs with the `unique` function:

```js
Jobs.register({
  name: 'syncUser',
  unique: (data) => data.userId,
  onDuplicate: 'skip',  // or 'replace' or 'error'
  run(data) {
    // sync the user
  },
});

// These two calls result in only one job:
await Jobs.run('syncUser', { userId: '123' });
await Jobs.run('syncUser', { userId: '123' }); // skipped
```

## Cancellation

```js
const jobId = await Jobs.run('longTask', { /* ... */ });

// Cancel a single job
await Jobs.cancel(jobId);

// Cancel all jobs of a type
await Jobs.cancelAll('longTask');
```

Running jobs receive an `AbortSignal` so they can clean up:

```js
Jobs.register({
  name: 'longTask',
  run(data, { signal }) {
    for (const item of data.items) {
      if (signal.aborted) return;
      processItem(item);
    }
  },
});
```

## Run and wait

Need the result back? Use `runAndWait`. The job still runs through the queue (possibly on another instance), but the caller waits for the outcome:

```js
const result = await Jobs.runAndWait('generateReport', { month: 'January' }, {
  waitTimeout: 60000,  // give up after 60s (default: 5 min)
});
```

## Retry a failed job

```js
await Jobs.retry(jobId);
```

This resets the job to `ready` with zero attempts, as a fresh execution.

## Concurrency

Global concurrency (per instance):

```js
Jobs.configure({ concurrency: 10 }); // max 10 jobs running at once
```

Per-type concurrency (cluster-wide):

```js
Jobs.register({
  name: 'heavyExport',
  concurrency: 2, // at most 2 running across all instances
  run(data) { /* ... */ },
});
```

## Configuration

```js
Jobs.configure({
  concurrency: 20,             // max jobs per instance (default: 20)
  pollInterval: 5000,          // polling fallback interval in ms (default: 5000)
  heartbeatInterval: 15000,    // heartbeat frequency in ms (default: 15000)
  stalledThreshold: 60000,     // consider a job stalled after this (default: 60000)
  retentionPeriod: '7d',       // keep completed/failed jobs for 7 days (default)
  shutdownTimeout: 30000,      // wait this long for jobs to finish on shutdown
  instanceId: 'worker-1',      // custom instance ID (auto-generated if omitted)
  authorize: (userId) => {     // gate the built-in publications
    return Roles.userIsInRoleAsync(userId, 'admin');
  },
});
```

## Lifecycle events

```js
Jobs.on('enqueued', (job) => console.log('Enqueued:', job.name));
Jobs.on('started',  (job) => console.log('Started:', job._id));
Jobs.on('completed', (job) => console.log('Done:', job._id));
Jobs.on('failed',   (job) => console.log('Failed:', job._id));
Jobs.on('retrying', (job, error, nextRetryAt) => { /* ... */ });
Jobs.on('stalled',  (job) => console.log('Stalled:', job._id));
Jobs.on('cancelled', (job) => { /* ... */ });

// Leader election events
Jobs.on('leader.acquired', () => console.log('This instance is now the leader'));
Jobs.on('leader.lost', () => console.log('Leadership lost'));
```

All event handlers return a handle with a `.stop()` method to unsubscribe.

## Per-job callbacks

```js
Jobs.register({
  name: 'importData',
  onComplete(result, job) {
    console.log(`Import finished: ${result.rowCount} rows`);
  },
  onFailure(error, job) {
    Slack.notify(`Import failed after ${job.attempts} attempts: ${error.message}`);
  },
  run(data) { /* ... */ },
});
```

## Publications

Three publications are included for building admin UIs. All are gated by the `authorize` function in your config -- if you don't set one, they return nothing.

- `jobs.status` -- all active (pending/ready/running) jobs, minimal fields
- `jobs.history` -- terminal jobs, sorted by most recent, capped at 200
- `jobs.job` -- a single job by ID

```js
// Client
Meteor.subscribe('jobs.status');
Meteor.subscribe('jobs.history', { name: 'sendEmail', limit: 50 });
Meteor.subscribe('jobs.job', someJobId);
```

## How it works

**Leader election.** One instance in the cluster is elected leader via a lock document in `_jobs_locks`. The leader handles cron scheduling, pending-to-ready promotion, stalled job detection, and retention cleanup. If the leader goes down, another instance takes over automatically.

**Job pickup.** Jobs are picked up via MongoDB oplog tailing (reactive observer) with a polling fallback. When a job becomes `ready`, instances race to claim it with an atomic `findOneAndUpdate`. Only one wins.

**Heartbeats.** Running jobs send periodic heartbeats. If a job's heartbeat goes stale (instance crashed), the leader detects it and routes the job through the retry/failure path.

**Graceful shutdown.** On `SIGTERM`/`SIGINT`, the engine stops accepting new work, waits for in-flight jobs to finish (up to `shutdownTimeout`), then returns any remaining jobs to the queue so another instance can pick them up.

## Job statuses

| Status | Meaning |
|--------|---------|
| `pending` | Waiting for its `scheduledAt` time to arrive |
| `ready` | Eligible to be picked up and executed |
| `running` | Currently being executed by an instance |
| `completed` | Finished successfully |
| `failed` | Failed after exhausting all retries |
| `cancelled` | Cancelled via `Jobs.cancel()` or `Jobs.cancelAll()` |

## Testing

Two test modes to make jobs easy to test:

```js
// Inline mode: jobs run synchronously, no MongoDB queue involved
Jobs.configure({ testMode: 'inline' });
const result = await Jobs.run('myJob', data); // runs immediately, returns handler result

// Manual mode: jobs are enqueued but not auto-picked up
Jobs.configure({ testMode: 'manual' });
const jobId = await Jobs.run('myJob', data);
await Jobs.executeNow(jobId); // trigger manually
```

## Worker pool (optional)

For CPU-heavy jobs, add the `worker-pool` package and set `offload: true`. The handler runs in a worker thread instead of the main event loop.

When a job is offloaded, the second argument to `run` is a thread-context bridge instead of the normal job context. This gives you `Collections` and `Meteor` -- proxied versions that talk back to the main thread over a MessagePort so you can still do database operations and call Meteor methods from within the worker.

```js
Jobs.register({
  name: 'processImage',
  offload: true,
  run(data, { Collections, Meteor }) {
    // This runs in a worker thread.

    // Collections is a universal proxy -- use any collection by name.
    // All operations are async and go through the bridge to the main thread.
    const asset = await Collections.Assets.findOneAsync({ _id: data.assetId });

    // Do the CPU-heavy work (this won't block the main event loop)
    const resized = sharp(asset.buffer).resize(800).toBuffer();

    // Write results back through the bridge
    await Collections.Assets.updateAsync(data.assetId, {
      $set: { thumbnail: resized, processedAt: new Date() },
    });

    return { size: resized.length };
  },
});
```

The `Collections` proxy supports all the standard async collection methods:

```js
run(data, { Collections, Meteor }) {
  // Reading
  const doc = await Collections.Orders.findOneAsync({ _id: data.orderId });
  const docs = await Collections.Orders.find({ status: 'pending' }).fetchAsync();
  const count = await Collections.Orders.find({ userId: data.userId }).countAsync();

  // Writing
  await Collections.Orders.insertAsync({ name: 'new order', createdAt: new Date() });
  await Collections.Orders.updateAsync(data.orderId, { $set: { status: 'shipped' } });
  await Collections.Orders.removeAsync(data.orderId);

  // Aggregation
  const stats = await Collections.Orders.aggregate([
    { $match: { status: 'completed' } },
    { $group: { _id: '$region', total: { $sum: '$amount' } } },
  ]);

  // Calling Meteor methods (runs on the main thread)
  await Meteor.callAsync('notifications.send', { userId: data.userId, message: 'Done' });

  // Meteor.settings is available (frozen snapshot from when the worker spawned)
  const apiKey = Meteor.settings.externalService.apiKey;
}
```

A few things to keep in mind:

- **No reactivity.** `observe()` and `observeChanges()` throw -- workers make discrete async calls, not subscriptions.
- **Structured clone boundary.** Data passed to and from the worker must be cloneable (no functions, no custom class instances with prototypes).
- **Settings are a snapshot.** `Meteor.settings` is frozen at worker spawn time.
- **The second argument is different.** Normal (non-offloaded) jobs get `{ id, name, attempts, runId, signal }`. Offloaded jobs get `{ Collections, Meteor }`. Plan your handler accordingly.

## API reference

| Method | Description |
|--------|-------------|
| `Jobs.register(definition)` | Register a job type |
| `Jobs.run(name, data?, options?)` | Enqueue a job, returns the job ID |
| `Jobs.runAndWait(name, data?, options?)` | Enqueue and wait for the result |
| `Jobs.cancel(jobId)` | Cancel a single job |
| `Jobs.cancelAll(name)` | Cancel all active jobs of a type |
| `Jobs.retry(jobId)` | Retry a failed/cancelled job |
| `Jobs.get(jobId)` | Fetch a job document |
| `Jobs.has(name)` | Check if a job type is registered |
| `Jobs.on(event, callback)` | Listen for lifecycle events |
| `Jobs.configure(options)` | Set global configuration |
| `Jobs.getConfig()` | Get current configuration |
| `Jobs.executeNow(jobId)` | Manually trigger a job (test mode) |
| `Jobs.collection` | The underlying `_jobs` Mongo.Collection |
| `Jobs.FatalError` | Error class to skip retries |
| `Jobs.DuplicateError` | Error class thrown on duplicate conflicts |
