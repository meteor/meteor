const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createMeteorClientSnapshotEnvironment,
} = require('../client/snapshot-environment.js');

test('client snapshot environment authenticates every server operation', async () => {
  const calls = [];
  const environment = createMeteorClientSnapshotEnvironment({
    generation: 7,
    token: 'test-token',
    async callAsync(method, payload) {
      calls.push({ method, payload });
      if (payload.operation === 'read') return 'stored';
      if (payload.operation === 'resolvePath') return '/app/test.js.snap';
      return null;
    },
  });

  assert.equal(environment.getVersion(), '1');
  assert.equal(environment.getHeader(), '// Rstest Snapshot v1');
  assert.equal(await environment.resolvePath('test.js'), '/app/test.js.snap');
  assert.equal(await environment.readSnapshotFile('/app/test.js.snap'), 'stored');
  await environment.saveSnapshotFile('/app/test.js.snap', 'next');
  await environment.removeSnapshotFile('/app/test.js.snap');

  assert.deepEqual(calls.map(call => call.payload.operation), [
    'resolvePath',
    'read',
    'save',
    'remove',
  ]);
  assert.equal(calls.every(call =>
    call.method === 'rstest/snapshot' &&
    call.payload.protocolVersion === 1 &&
    call.payload.generation === 7 &&
    call.payload.token === 'test-token'
  ), true);
});
