const assert = require('node:assert/strict');
const test = require('node:test');

const { cleanupTestRunner } = require('../provider-cleanup.js');

test('provider cleanup releases build context even when stopping fails', async () => {
  const expected = new Error('provider stop failed');
  let cleared = false;
  await assert.rejects(cleanupTestRunner({
    session: { async stop() { throw expected; } },
    clearContext() { cleared = true; },
  }), error => error === expected);
  assert.equal(cleared, true);
});

test('provider cleanup keeps the original failure and records a stop failure', async () => {
  const error = new Error('host failed');
  const cleanupError = new Error('provider stop failed');
  let cleared = false;
  await cleanupTestRunner({
    session: { async stop() { throw cleanupError; } },
    clearContext() { cleared = true; },
    error,
  });
  assert.equal(error.cleanupError, cleanupError);
  assert.equal(cleared, true);
});
