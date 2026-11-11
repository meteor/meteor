/**
 * @module jobs/tests/execution-test
 * @summary Tests for job execution using testMode: 'inline'.
 */

const { Jobs } = require('meteor/jobs');

let _seq = 0;
function uniqueName(prefix) {
  return `test_exec_${prefix}_${++_seq}_${Date.now()}`;
}

Tinytest.addAsync('jobs - execution - job runs and returns result (inline mode)', async function (test) {
  Jobs.configure({ testMode: 'inline' });

  const name = uniqueName('return');
  Jobs.register({
    name,
    run(data) {
      return { doubled: data.value * 2 };
    },
  });

  const result = await Jobs.run(name, { value: 21 });
  test.equal(result.doubled, 42);
});

Tinytest.addAsync('jobs - execution - handler receives correct jobContext', async function (test) {
  Jobs.configure({ testMode: 'inline' });

  const name = uniqueName('ctx');
  let capturedCtx = null;

  Jobs.register({
    name,
    run(data, ctx) {
      capturedCtx = ctx;
      return 'ok';
    },
  });

  await Jobs.run(name, { x: 1 });

  test.isNotNull(capturedCtx, 'jobContext should be passed to handler');
  test.equal(capturedCtx.name, name, 'jobContext.name should match');
  test.isNull(capturedCtx.id, 'jobContext.id should be null in inline mode');
  test.equal(capturedCtx.attempts, 1, 'jobContext.attempts should be 1');
  test.isNotUndefined(capturedCtx.runId, 'jobContext.runId should exist');
  test.isNotUndefined(capturedCtx.signal, 'jobContext.signal should exist');
  test.isTrue(capturedCtx.signal instanceof AbortSignal, 'signal should be an AbortSignal');
});

Tinytest.addAsync('jobs - execution - handler error propagates (inline mode)', async function (test) {
  Jobs.configure({ testMode: 'inline' });

  const name = uniqueName('err');
  Jobs.register({
    name,
    run() {
      throw new Error('handler boom');
    },
  });

  try {
    await Jobs.run(name, {});
    test.fail('Should have thrown');
  } catch (err) {
    test.matches(err.message, /handler boom/);
  }
});

Tinytest.addAsync('jobs - execution - async handler works (inline mode)', async function (test) {
  Jobs.configure({ testMode: 'inline' });

  const name = uniqueName('async');
  Jobs.register({
    name,
    async run(data) {
      return new Promise((resolve) => {
        setTimeout(() => resolve(data.val + 1), 10);
      });
    },
  });

  const result = await Jobs.run(name, { val: 9 });
  test.equal(result, 10);
});
