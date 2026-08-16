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
  createGeneratedConfig,
} = require('../src/generated-config.js');
const {
  MeteorCoverageCaptureReporter,
} = require('../src/coverage/reporter.js');
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

test('Meteor runtime settings project serializable upstream semantics and validation', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-config-'));
  const setupFile = path.join(root, 'support', 'setup.js');
  fs.mkdirSync(path.dirname(setupFile), { recursive: true });
  fs.writeFileSync(setupFile, '');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(runtimeSettingsFromConfig({}), {
    testTimeout: 30000,
    hookTimeout: 10000,
    maxConcurrency: 5,
    retry: 0,
    globals: false,
    clearMocks: false,
    resetMocks: false,
    restoreMocks: false,
    unstubEnvs: false,
    unstubGlobals: false,
    expect: {},
    snapshotFormat: {},
    env: {},
    silent: false,
    disableConsoleIntercept: true,
    printConsoleTrace: false,
    includeTaskLocation: false,
    setupFiles: [],
  });
  assert.deepEqual(runtimeSettingsFromConfig({
    root,
    setupFiles: ['<rootDir>/support/setup.js'],
    maxConcurrency: 3,
    retry: 2,
    globals: true,
    clearMocks: true,
    expect: { poll: { interval: 10 } },
    snapshotFormat: { printBasicPrototype: false },
    env: { FEATURE: 'enabled' },
    disableConsoleIntercept: false,
  }), {
    testTimeout: 30000,
    hookTimeout: 10000,
    maxConcurrency: 3,
    retry: 2,
    globals: true,
    clearMocks: true,
    resetMocks: false,
    restoreMocks: false,
    unstubEnvs: false,
    unstubGlobals: false,
    expect: { poll: { interval: 10 } },
    snapshotFormat: { printBasicPrototype: false },
    env: { FEATURE: 'enabled' },
    silent: false,
    disableConsoleIntercept: false,
    printConsoleTrace: false,
    includeTaskLocation: false,
    setupFiles: [setupFile],
  });
  assert.throws(
    () => runtimeSettingsFromConfig({ maxConcurrency: 0 }),
    error => {
      assert.equal(error.code, 'METEOR_RSTEST_INVALID_MAX_CONCURRENCY');
      assert.match(error.message, /positive integer/);
      return true;
    },
  );
  assert.throws(
    () => runtimeSettingsFromConfig({ retry: -1 }),
    error => error.code === 'METEOR_RSTEST_INVALID_RETRY',
  );
  assert.throws(
    () => runtimeSettingsFromConfig({ expect: { plugin() {} } }),
    error => error.code === 'METEOR_RSTEST_RUNTIME_CONFIG_NOT_SERIALIZABLE',
  );
  assert.throws(
    () => runtimeSettingsFromConfig({ root, setupFiles: ['./missing.js'] }),
    error => error.code === 'METEOR_RSTEST_SETUP_FILE_NOT_FOUND',
  );
});

test('mixed coverage writes a runtime plan and defers only native coverage finalization', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-coverage-config-'));
  const configPath = path.join(root, 'rstest.config.js');
  const planOutput = path.join(root, 'coverage-plan.json');
  const settingsOutput = path.join(root, 'runtime-settings.json');
  const artifactPath = path.join(root, 'artifacts', 'native.json');
  fs.writeFileSync(configPath, `module.exports = {
    reporters: 'dot',
    coverage: {
      enabled: true,
      provider: 'istanbul',
      include: ['imports/**/*.js'],
      reporters: ['text'],
      thresholds: { lines: 100 },
      clean: true,
    },
  };`);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const config = await createGeneratedConfig({
    context: makeContext({ appRoot: root, configRoot: root, localDir: path.join(root, '.meteor', 'local') }),
    configPath,
    runtimeSettingsOutput: settingsOutput,
    runtimeSettingsGeneration: 'generation-5',
    coveragePlanOutput: planOutput,
    coverageGeneration: 'generation-5',
    coverageArtifact: artifactPath,
    cliCoverageEnabled: true,
    deferNativeReport: true,
  })();

  assert.deepEqual(JSON.parse(fs.readFileSync(planOutput, 'utf8')), {
    schemaVersion: 1,
    generation: 'generation-5',
    enabled: true,
    provider: 'istanbul',
    root,
    include: ['imports/**/*.js'],
    exclude: [],
    allowExternal: false,
    artifactRoot: path.dirname(artifactPath),
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(settingsOutput, 'utf8')).coverage, {
    schemaVersion: 1,
    generation: 'generation-5',
    enabled: true,
    provider: 'istanbul',
    root,
    include: ['imports/**/*.js'],
    exclude: [],
    allowExternal: false,
    artifactRoot: path.dirname(artifactPath),
  });
  assert.equal(config.reporters[0], 'dot');
  assert.ok(config.reporters[1] instanceof MeteorCoverageCaptureReporter);
  assert.deepEqual(config.coverage.reporters, []);
  assert.equal(config.coverage.thresholds, undefined);
  assert.deepEqual(config.coverage.include, []);
  assert.equal(config.coverage.clean, false);
});

test('disabled coverage ignores wrapper plan and artifact options', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-disabled-coverage-'));
  const configPath = path.join(root, 'rstest.config.js');
  const planOutput = path.join(root, 'coverage-plan.json');
  const settingsOutput = path.join(root, 'runtime-settings.json');
  const artifactPath = path.join(root, 'artifacts', 'native.json');
  fs.writeFileSync(configPath, `module.exports = {
    reporters: 'dot',
    coverage: { enabled: false, provider: 'istanbul' },
  };`);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const config = await createGeneratedConfig({
    context: makeContext({ appRoot: root, configRoot: root, localDir: path.join(root, '.meteor', 'local') }),
    configPath,
    runtimeSettingsOutput: settingsOutput,
    runtimeSettingsGeneration: 'generation-disabled',
    coveragePlanOutput: planOutput,
    coverageGeneration: 'generation-disabled',
    coverageArtifact: artifactPath,
    cliCoverageEnabled: false,
    deferNativeReport: true,
    hasMeteorRuntime: true,
  })();

  assert.equal(fs.existsSync(planOutput), false);
  assert.equal(fs.existsSync(artifactPath), false);
  assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(settingsOutput, 'utf8')), 'coverage'), false);
  assert.equal(config.reporters, 'dot');
  assert.equal(config.coverage.enabled, false);
  assert.equal(config.coverage.provider, 'istanbul');
});

test('native-only coverage leaves upstream reporters and coverage settings untouched', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-native-coverage-'));
  const configPath = path.join(root, 'rstest.config.js');
  fs.writeFileSync(configPath, `module.exports = {
    reporters: 'dot',
    coverage: {
      enabled: true,
      provider: 'v8',
      include: ['imports/**/*.js'],
      reporters: ['text'],
      thresholds: { lines: 100 },
      clean: true,
    },
  };`);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const config = await createGeneratedConfig({
    context: makeContext({ appRoot: root, configRoot: root, localDir: path.join(root, '.meteor', 'local') }),
    configPath,
    coverageGeneration: 'generation-6',
    cliCoverageEnabled: true,
    deferNativeReport: false,
    hasMeteorRuntime: false,
  })();

  assert.equal(config.reporters, 'dot');
  assert.deepEqual(config.coverage, {
    enabled: true,
    provider: 'v8',
    include: ['imports/**/*.js'],
    reporters: ['text'],
    thresholds: { lines: 100 },
    clean: true,
  });
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

test('Meteor context preserves an absolute routing manifest', () => {
  const context = makeContext({
    routingManifest: '/tmp/meteor-local/rstest/routing.json',
  });

  assert.equal(
    context.routingManifest,
    '/tmp/meteor-local/rstest/routing.json',
  );
  assert.ok(Object.isFrozen(context));
  assert.throws(
    () => makeContext({ routingManifest: 'relative/routing.json' }),
    /routingManifest must be an absolute path/,
  );
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
