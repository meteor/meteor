const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { defineConfig } = require('../index.js');
const {
  runtimeSettingsFromConfig,
} = require('../src/coordinator.js');
const {
  createMeteorRstestContext,
  withMeteorRstestContext,
} = require('../src/config/context.js');

function makeContext(overrides = {}) {
  return createMeteorRstestContext({
    appRoot: '/tmp/meteor-app',
    configRoot: '/tmp/meteor-app',
    harnessRoot: '/tmp/meteor-harness',
    localDir: '/tmp/meteor-local',
    command: 'test',
    once: true,
    fullApp: false,
    packageTests: false,
    client: true,
    server: true,
    ...overrides,
  });
}

test('object config remains directly usable by native Rstest', () => {
  const config = { test: { include: ['tests/rstest/pure/**/*.test.js'] } };

  assert.equal(defineConfig(config), config);
});

test('Meteor runtime settings preserve native maxConcurrency defaults and validation', () => {
  assert.deepEqual(runtimeSettingsFromConfig({}), {
    testTimeout: 30000,
    hookTimeout: 10000,
    maxConcurrency: 5,
  });
  assert.deepEqual(runtimeSettingsFromConfig({ maxConcurrency: 3 }), {
    testTimeout: 30000,
    hookTimeout: 10000,
    maxConcurrency: 3,
  });
  assert.throws(
    () => runtimeSettingsFromConfig({ maxConcurrency: 0 }),
    error => {
      assert.equal(error.code, 'METEOR_RSTEST_INVALID_MAX_CONCURRENCY');
      assert.match(error.message, /positive integer/);
      return true;
    },
  );
});

test('Meteor config factory receives immutable normalized context once', async () => {
  let calls = 0;
  const config = defineConfig(async context => {
    calls += 1;
    assert.equal(context.schemaVersion, 1);
    assert.equal(context.command, 'test-packages');
    assert.equal(context.packageTests, true);
    assert.equal(context.appRoot, '/tmp/meteor-app');
    assert.equal(context.verbose, true);
    assert.ok(Object.isFrozen(context));
    assert.ok(Object.isFrozen(context.architectures));
    return { test: { name: 'custom' } };
  });

  const context = makeContext({
    command: 'test-packages',
    packageTests: true,
    verbose: true,
    architectures: ['server', 'web.browser'],
  });
  const resolved = await withMeteorRstestContext(context, () => config());

  assert.deepEqual(resolved, { test: { name: 'custom' } });
  assert.equal(calls, 1);
});

test('Meteor context crosses separately installed coordinator copies', async t => {
  const duplicateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-context-'));
  const duplicatePath = path.join(duplicateRoot, 'context.js');
  fs.copyFileSync(
    path.resolve(__dirname, '../src/config/context.js'),
    duplicatePath,
  );
  t.after(() => fs.rmSync(duplicateRoot, { recursive: true, force: true }));

  const duplicateContext = require(duplicatePath);
  const config = defineConfig(context => ({ command: context.command }));
  const resolved = await duplicateContext.withMeteorRstestContext(
    makeContext({ command: 'test-packages' }),
    () => config(),
  );

  assert.deepEqual(resolved, { command: 'test-packages' });
});

test('Meteor context normalizes verbosity to a frozen boolean', () => {
  const quiet = makeContext();
  const verbose = makeContext({ verbose: 'enabled' });

  assert.equal(quiet.verbose, false);
  assert.equal(verbose.verbose, true);
  assert.ok(Object.isFrozen(verbose));
});

test('Meteor context factory fails clearly when called by standalone Rstest', () => {
  const config = defineConfig(() => ({}));

  assert.throws(() => config(), error => {
    assert.equal(error.code, 'METEOR_RSTEST_CONTEXT_REQUIRED');
    assert.match(error.message, /run this config through meteor test/i);
    return true;
  });
});

test('context rejects missing absolute roots', () => {
  assert.throws(
    () => createMeteorRstestContext({ appRoot: 'relative/app' }),
    error => {
      assert.equal(error.code, 'METEOR_RSTEST_INVALID_CONTEXT');
      assert.match(error.message, /appRoot must be an absolute path/);
      return true;
    }
  );
});
