/**
 * @module jobs/tests/dedup-test
 * @summary Tests for deduplication logic — unique keys, skip/error policies.
 */

const { Jobs } = require('meteor/jobs');

let _seq = 0;
function uniqueName(prefix) {
  return `test_dedup_${prefix}_${++_seq}_${Date.now()}`;
}

Tinytest.addAsync('jobs - dedup - unique function derives dedup key', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('key');
  Jobs.register({
    name,
    unique(data) { return data.userId; },
    onDuplicate: 'skip',
    run() { return 'ok'; },
  });

  const id1 = await Jobs.run(name, { userId: 'user1' });
  const job1 = await Jobs.get(id1);
  test.equal(job1.dedupKey, `${name}:user1`);

  // Clean up
  await Jobs.cancel(id1);
});

Tinytest.addAsync('jobs - dedup - skip policy returns existing job ID', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('skip');
  Jobs.register({
    name,
    unique(data) { return data.key; },
    onDuplicate: 'skip',
    run() { return 'ok'; },
  });

  const id1 = await Jobs.run(name, { key: 'abc' });
  const id2 = await Jobs.run(name, { key: 'abc' });

  test.equal(id1, id2, 'Skip policy should return the same job ID');

  // Clean up
  await Jobs.cancel(id1);
});

Tinytest.addAsync('jobs - dedup - error policy throws DuplicateError', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('error');
  Jobs.register({
    name,
    unique(data) { return data.key; },
    onDuplicate: 'error',
    run() { return 'ok'; },
  });

  const id1 = await Jobs.run(name, { key: 'xyz' });

  try {
    await Jobs.run(name, { key: 'xyz' });
    test.fail('Should have thrown DuplicateError');
  } catch (err) {
    test.isTrue(err instanceof Jobs.DuplicateError, 'Should be a DuplicateError');
    test.matches(err.message, /dedupKey/i);
  }

  // Clean up
  await Jobs.cancel(id1);
});

Tinytest.addAsync('jobs - dedup - dedup key is cleared on cancellation', async function (test) {
  Jobs.configure({ testMode: 'manual' });

  const name = uniqueName('clear');
  Jobs.register({
    name,
    unique(data) { return data.key; },
    onDuplicate: 'skip',
    run() { return 'ok'; },
  });

  const id1 = await Jobs.run(name, { key: 'clear1' });
  await Jobs.cancel(id1);

  // After cancellation, the dedup key should be cleared so a new job can be enqueued
  const id2 = await Jobs.run(name, { key: 'clear1' });
  test.notEqual(id1, id2, 'New job should get a new ID after cancellation');

  // Clean up
  await Jobs.cancel(id2);
});
