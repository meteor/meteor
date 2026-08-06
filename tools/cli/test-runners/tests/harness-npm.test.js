const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  createHarnessNpmService,
} = require('../harness-npm.js');

function tempRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-harness-npm-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function manifestPath(root) {
  return path.join(root, 'package.json');
}

function successfulInstaller(calls) {
  return async (root, options) => {
    calls.push({ root, options });
    const filename = manifestPath(root);
    let json = {};
    try {
      json = JSON.parse(fs.readFileSync(filename, 'utf8'));
    } catch {}
    json.dependencies = {
      '@babel/runtime': '^7.0.0',
      ...json.dependencies,
    };
    fs.writeFileSync(filename, `${JSON.stringify(json, null, 2)}\n`);
    return true;
  };
}

test('driver transaction restores pre-existing package.json byte-for-byte', async t => {
  const root = tempRoot(t);
  const original = '{\n  "private": true,\n  "custom": "spacing"\n}\n';
  fs.writeFileSync(manifestPath(root), original);
  const service = createHarnessNpmService({
    root,
    install: successfulInstaller([]),
  });

  await service.ensureHarnessManifest({ retain: false });
  assert.notEqual(fs.readFileSync(manifestPath(root), 'utf8'), original);
  await service.restoreIfTemporary();
  assert.equal(fs.readFileSync(manifestPath(root), 'utf8'), original);
});

test('driver transaction removes generated package.json', async t => {
  const root = tempRoot(t);
  const service = createHarnessNpmService({
    root,
    install: successfulInstaller([]),
  });

  await service.ensureHarnessManifest({ retain: false });
  assert.equal(fs.existsSync(manifestPath(root)), true);
  await service.restoreIfTemporary();
  assert.equal(fs.existsSync(manifestPath(root)), false);
});

test('provider transaction retains Meteor defaults and exposes source policy', async t => {
  const root = tempRoot(t);
  const calls = [];
  const service = createHarnessNpmService({
    root,
    autoInstall: false,
    install: successfulInstaller(calls),
  });

  await service.ensureHarnessManifest();
  await service.restoreIfTemporary();

  assert.equal(service.root, root);
  assert.equal(service.autoInstall, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.persistDefaultDependencies, true);
  assert.equal(
    JSON.parse(fs.readFileSync(manifestPath(root), 'utf8')).dependencies['@babel/runtime'],
    '^7.0.0'
  );
});

test('failed install restores original manifest', async t => {
  const root = tempRoot(t);
  const original = '{"name":"original"}\n';
  fs.writeFileSync(manifestPath(root), original);
  const service = createHarnessNpmService({
    root,
    install: async installRoot => {
      fs.writeFileSync(manifestPath(installRoot), '{"name":"mutated"}\n');
      return false;
    },
  });

  await assert.rejects(
    service.ensureHarnessManifest(),
    error => error.code === 'METEOR_TEST_RUNNER_NPM_INSTALL_FAILED'
  );
  assert.equal(fs.readFileSync(manifestPath(root), 'utf8'), original);
});

test('local file specs survive provider install preparation', async t => {
  const root = tempRoot(t);
  fs.writeFileSync(manifestPath(root), JSON.stringify({
    dependencies: {
      '@example/compiler': 'file:../../npm-packages/compiler',
    },
    devDependencies: {
      '@example/test-runner': 'file:../../npm-packages/test-runner',
    },
  }, null, 2));
  const service = createHarnessNpmService({
    root,
    install: successfulInstaller([]),
  });

  await service.ensureHarnessManifest();
  const manifest = JSON.parse(fs.readFileSync(manifestPath(root), 'utf8'));
  assert.equal(
    manifest.dependencies['@example/compiler'],
    'file:../../npm-packages/compiler'
  );
  assert.equal(
    manifest.devDependencies['@example/test-runner'],
    'file:../../npm-packages/test-runner'
  );
});

test('repeated ensure call shares one install transaction', async t => {
  const root = tempRoot(t);
  const calls = [];
  const service = createHarnessNpmService({
    root,
    install: successfulInstaller(calls),
  });

  const first = service.ensureHarnessManifest();
  const second = service.ensureHarnessManifest();
  assert.equal(first, second);
  await first;
  assert.equal(calls.length, 1);
});
