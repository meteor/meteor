const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createResultGate,
  mergeArchitectureResults,
} = require('./coordinator.js');

function result({ passed = 0, failed = 0, skipped = 0, todo = 0 } = {}) {
  return {
    ok: failed === 0,
    stats: {
      total: passed + failed + skipped + todo,
      passed,
      failed,
      skipped,
      todo,
    },
    cases: [],
  };
}

test('client result gate supports submit-before-wait and one delivery', async () => {
  const gate = createResultGate({ timeoutMs: 50 });
  const clientResult = result({ passed: 1 });

  assert.equal(gate.submit(clientResult), true);
  assert.equal(gate.submit(result({ failed: 1 })), false);
  assert.equal(await gate.wait(), clientResult);
});

test('client result gate reports actionable timeout', async () => {
  const gate = createResultGate({ timeoutMs: 5 });
  await assert.rejects(gate.wait(), /Meteor client Rstest result after 5ms/);
});

test('architecture result merge preserves per-case architecture and failure', () => {
  const server = result({ passed: 2 });
  server.cases.push({ name: 'server case', status: 'pass' });
  const client = result({ failed: 1 });
  client.cases.push({ name: 'client case', status: 'fail' });

  assert.deepEqual(mergeArchitectureResults([
    { architecture: 'server', result: server },
    { architecture: 'web.browser', result: client },
  ]), {
    ok: false,
    stats: { total: 3, passed: 2, failed: 1, skipped: 0, todo: 0 },
    cases: [
      { name: 'server case', status: 'pass', architecture: 'server' },
      { name: 'client case', status: 'fail', architecture: 'web.browser' },
    ],
  });
});

test('architecture result merge fails defensively when nothing executed', () => {
  const result = mergeArchitectureResults([]);

  assert.equal(result.ok, false);
  assert.equal(result.stats.failed, 1);
  assert.match(result.cases[0].error.message, /No supported test architecture/);
});
