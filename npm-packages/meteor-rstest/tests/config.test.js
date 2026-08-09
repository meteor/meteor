const assert = require('node:assert/strict');
const test = require('node:test');

const { defineConfig } = require('../index.js');
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
