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
