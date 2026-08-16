const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  createMeteorSnapshotEnvironment,
} = require('../server/snapshot-environment.js');

test('Meteor snapshot environment persists only app-owned snapshot paths', async t => {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-snapshot-'));
  t.after(() => fs.rmSync(appRoot, { recursive: true, force: true }));
  const environment = createMeteorSnapshotEnvironment({ appRoot });
  const snapshotPath = await environment.resolvePath(
    'tests/rstest/runtime/server/items.test.js',
  );

  assert.equal(snapshotPath, path.join(
    appRoot,
    'tests/rstest/runtime/server/__snapshots__/items.test.js.snap',
  ));
  await environment.saveSnapshotFile(snapshotPath, 'snapshot contents');
  assert.equal(await environment.readSnapshotFile(snapshotPath), 'snapshot contents');
  await environment.removeSnapshotFile(snapshotPath);
  assert.equal(await environment.readSnapshotFile(snapshotPath), null);

  await assert.rejects(
    environment.resolvePath('../outside.test.js'),
    /inside application root/,
  );
  await assert.rejects(
    environment.readSnapshotFile(path.resolve(appRoot, '..', 'outside.snap')),
    /inside application root/,
  );
});
