const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
  seedTestAppLocalCache,
} = require('../seed-test-app-cache.js');

test('worker cache seeding copies mutable build-plugin state', async () => {
  const copied = [];
  const linked = [];
  const files = {
    pathJoin: path.join,
    pathDirname: path.dirname,
    mkdir_p() {},
    async cp_r(source, target, options) {
      copied.push([source, target, options]);
    },
    symlink(source, target) {
      linked.push([source, target]);
    },
  };

  await seedTestAppLocalCache({
    files,
    sourceLocalDir: '/source/local',
    targetLocalDir: '/worker/local',
    isolateBuildPluginState: true,
  });

  assert.deepEqual(copied.map(([, target]) => path.basename(target)), [
    'build',
    'isopacks',
    'plugin-cache',
  ]);
  assert.equal(copied[0][2].preserveSymlinks, true);
  assert.equal(copied[1][2].preserveSymlinks, false);
  assert.equal(copied[2][2].preserveSymlinks, false);
  assert.deepEqual(linked.map(([, target]) => path.basename(target)), [
    'bundler-cache',
    'shell',
  ]);
});
