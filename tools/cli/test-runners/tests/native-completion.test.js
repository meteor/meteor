const assert = require('node:assert/strict');
const test = require('node:test');

const {
  completeNativeOnlyTestRunner,
} = require('../native-completion.js');

test('native-only completion runs before cleanup and retains a non-zero execution code', async () => {
  const calls = [];
  const exitCode = await completeNativeOnlyTestRunner({
    exitCode: 2,
    session: {
      async completeRun(context) {
        calls.push(['completeRun', context]);
        return { exitCode: 1 };
      },
      async stop() {
        calls.push('stop');
      },
    },
    async clearContext() {
      calls.push('clearContext');
    },
  });

  assert.equal(exitCode, 2);
  assert.deepEqual(calls, [
    ['completeRun', { exitCode: 2, outcome: 'failed' }],
    'stop',
    'clearContext',
  ]);
});

test('native process rejection still stops the provider and clears build context', async () => {
  const expected = new Error('native process failed');
  const calls = [];
  await assert.rejects(completeNativeOnlyTestRunner({
    completion: Promise.reject(expected),
    session: {
      async completeRun() { calls.push('completeRun'); },
      async stop() { calls.push('stop'); },
    },
    clearContext() { calls.push('clearContext'); },
  }), error => error === expected);
  assert.deepEqual(calls, ['stop', 'clearContext']);
});

test('native process failure remains primary when provider cleanup also fails', async () => {
  const expected = new Error('native process failed');
  const cleanupError = new Error('provider stop failed');
  let cleared = false;
  await assert.rejects(completeNativeOnlyTestRunner({
    completion: Promise.reject(expected),
    session: {
      async stop() { throw cleanupError; },
    },
    clearContext() { cleared = true; },
  }), error => error === expected);
  assert.equal(cleared, true);
  assert.equal(expected.cleanupError, cleanupError);
});
