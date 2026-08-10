const assert = require('node:assert/strict');
const test = require('node:test');

const {
  GLOBAL_STATE_KEYS,
  getRstestDependencies,
  ensureRstestInstalled,
  shouldEnsureRstestDependencies,
} = require('../tooling/lib/dependencies.js');
const meteorRstestPackage = require('../../../npm-packages/meteor-rstest/package.json');

const EXPECTED_DEPENDENCIES = [
  ['@meteorjs/rstest', '0.1.0-beta.0'],
  ['@rstest/core', '0.11.6'],
  ['@rstest/adapter-rspack', '0.11.6'],
];

test('Rstest dependency manifest installs only required coordinator dependencies', () => {
  const dependencies = getRstestDependencies({});

  assert.deepEqual(
    dependencies.map(({ name, version }) => [name, version]),
    EXPECTED_DEPENDENCIES,
  );
  assert.ok(dependencies.every(dependency =>
    dependency.dev === true &&
    dependency.exact === true &&
    dependency.semverCondition === 'eq'
  ));
});

test('Atmosphere dependency manifest stays aligned with @meteorjs/rstest metadata', () => {
  const dependencies = getRstestDependencies({});
  const coordinator = dependencies.find(({ name }) => name === '@meteorjs/rstest');
  const runtimeDependencies = Object.fromEntries(
    dependencies
      .filter(({ name }) => name !== '@meteorjs/rstest')
      .map(({ name, version }) => [name, version]),
  );

  assert.equal(coordinator.version, meteorRstestPackage.version);
  assert.deepEqual(runtimeDependencies, meteorRstestPackage.dependencies);
});

test('optional Rstest capabilities remain project-owned', () => {
  const baselineNames = new Set(
    getRstestDependencies({}).map(({ name }) => name),
  );

  for (const optionalName of [
    '@rstest/browser',
    '@rstest/coverage-istanbul',
    '@rstest/coverage-v8',
    '@rstest/playwright',
    'happy-dom',
    'jsdom',
    'playwright',
  ]) {
    assert.equal(baselineNames.has(optionalName), false, optionalName);
    assert.equal(
      Object.hasOwn(meteorRstestPackage.dependencies, optionalName),
      false,
      optionalName,
    );
  }
});

test('Rstest dependency manifest preserves local unpublished npm specs', () => {
  const dependencies = getRstestDependencies({
    METEOR_RSTEST_NPM_SPEC: '/repo/npm-packages/meteor-rstest',
  });

  assert.equal(
    dependencies.find(({ name }) => name === '@meteorjs/rstest').spec,
    '/repo/npm-packages/meteor-rstest',
  );
  const names = new Set(dependencies.map(({ name }) => name));
  for (const rspackOwnedName of [
    '@meteorjs/rspack',
    '@rspack/core',
    '@rspack/cli',
    '@swc/core',
  ]) {
    assert.equal(names.has(rspackOwnedName), false);
  }
});

test('Rstest installer adds every missing dependency exactly once', async () => {
  const installed = [];
  const existenceChecks = [];
  const state = new Map();
  const services = {
    getGlobalState(key, fallback) {
      return state.has(key) ? state.get(key) : fallback;
    },
    setGlobalState(key, value) {
      state.set(key, value);
    },
    getMeteorAppDir: () => '/outside-cwd',
    isMeteorAppUpdate: () => false,
    checkNpmDependencyExists: (name, options) => {
      existenceChecks.push({ name, options });
      return false;
    },
    checkNpmDependencyVersion: () => false,
    installNpmDependency: async (dependencies, options) => {
      installed.push({ dependencies, options });
      return true;
    },
    isYarnProject: () => false,
    logProgress() {},
    logSuccess() {},
    logInfo() {},
    logError() {},
  };

  const env = { METEOR_RSTEST_NPM_ROOT: '/meteor-harness' };
  await ensureRstestInstalled({ env, services });
  await ensureRstestInstalled({ env, services });

  assert.equal(installed.length, 1);
  assert.deepEqual(
    installed[0].dependencies,
    EXPECTED_DEPENDENCIES.map(([name, version]) => `${name}@${version}`),
  );
  assert.deepEqual(installed[0].options, {
    cwd: '/meteor-harness',
    dev: true,
    exact: true,
    includeDevDependencies: true,
    yarn: false,
  });
  assert.ok(existenceChecks.every(({ options }) => options.nodeModulesOnly === true));
  assert.equal(state.get(GLOBAL_STATE_KEYS.RSTEST_INSTALLATION_CHECKED), true);
});

test('Rstest installer preserves declared local package specs when reinstalling', async () => {
  let installed;
  const services = {
    getGlobalState: () => false,
    setGlobalState() {},
    getMeteorAppDir: () => '/meteor-app',
    getMeteorAppPackageJson: () => ({
      devDependencies: {
        '@meteorjs/rstest': 'file:../meteor-rstest',
      },
    }),
    isMeteorAppUpdate: () => false,
    checkNpmDependencyExists: () => false,
    checkNpmDependencyVersion: () => false,
    installNpmDependency: async dependencies => {
      installed = dependencies;
      return true;
    },
    isYarnProject: () => false,
    logProgress() {},
    logSuccess() {},
    logInfo() {},
    logError() {},
  };

  await ensureRstestInstalled({ env: {}, services });

  assert.equal(installed[0], '@meteorjs/rstest@file:../meteor-rstest');
  assert.equal(installed.length, EXPECTED_DEPENDENCIES.length);
});

test('Rstest installer reports failed package-manager operation', async () => {
  const errors = [];
  const services = {
    getGlobalState: () => false,
    setGlobalState() {},
    getMeteorAppDir: () => '/meteor-app',
    isMeteorAppUpdate: () => false,
    checkNpmDependencyExists: () => false,
    checkNpmDependencyVersion: () => false,
    installNpmDependency: async () => false,
    isYarnProject: () => false,
    logProgress() {},
    logSuccess() {},
    logInfo() {},
    logError(message) {
      errors.push(message);
    },
  };

  await assert.rejects(
    ensureRstestInstalled({ env: {}, services }),
    /Failed to install Rstest dev dependencies/,
  );
  assert.ok(errors.some(message =>
    message.includes('meteor npm install -D --save-exact --production=false')
  ));
});

test('Rstest plugin activation follows selected Meteor test engine', () => {
  assert.equal(shouldEnsureRstestDependencies({
    testRunner: 'rstest',
    isAppTestCommand: true,
    isPackagesTestCommand: false,
    autoInstallDeps: true,
  }), true);
  assert.equal(shouldEnsureRstestDependencies({
    testRunner: 'driver',
    isAppTestCommand: true,
    isPackagesTestCommand: false,
    autoInstallDeps: true,
  }), false);
  assert.equal(shouldEnsureRstestDependencies({
    testRunner: 'rstest',
    isAppTestCommand: false,
    isPackagesTestCommand: false,
    autoInstallDeps: true,
  }), false);
  assert.equal(shouldEnsureRstestDependencies({
    testRunner: 'rstest',
    isAppTestCommand: false,
    isPackagesTestCommand: true,
    autoInstallDeps: false,
  }), false);
});
