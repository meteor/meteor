const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
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

test('worker cache seeding dereferences nested mutable-cache links', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-worker-cache-'));
  const sourceLocalDir = path.join(root, 'source');
  const targetLocalDir = path.join(root, 'worker');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  for (const name of ['build', 'bundler-cache', 'isopacks', 'plugin-cache', 'shell']) {
    fs.mkdirSync(path.join(sourceLocalDir, name), { recursive: true });
  }
  for (const name of ['isopacks', 'plugin-cache']) {
    const shared = path.join(sourceLocalDir, `${name}-shared`);
    fs.mkdirSync(shared);
    fs.writeFileSync(path.join(shared, 'state.json'), '{"owner":"source"}');
    fs.symlinkSync(shared, path.join(sourceLocalDir, name, 'nested'));
  }

  const files = {
    pathJoin: path.join,
    pathDirname: path.dirname,
    mkdir_p(directory) { fs.mkdirSync(directory, { recursive: true }); },
    async cp_r(source, target, { preserveSymlinks }) {
      fs.cpSync(source, target, {
        recursive: true,
        dereference: !preserveSymlinks,
      });
    },
    symlink(source, target) { fs.symlinkSync(source, target, 'junction'); },
  };

  await seedTestAppLocalCache({
    files,
    sourceLocalDir,
    targetLocalDir,
    isolateBuildPluginState: true,
  });

  for (const name of ['isopacks', 'plugin-cache']) {
    const workerNested = path.join(targetLocalDir, name, 'nested');
    const sourceState = path.join(sourceLocalDir, `${name}-shared`, 'state.json');
    assert.equal(fs.lstatSync(workerNested).isSymbolicLink(), false);
    fs.writeFileSync(path.join(workerNested, 'state.json'), '{"owner":"worker"}');
    assert.equal(fs.readFileSync(sourceState, 'utf8'), '{"owner":"source"}');
  }
  assert.equal(
    fs.lstatSync(path.join(targetLocalDir, 'bundler-cache')).isSymbolicLink(),
    true,
  );
  assert.equal(
    fs.lstatSync(path.join(targetLocalDir, 'shell')).isSymbolicLink(),
    true,
  );
});
