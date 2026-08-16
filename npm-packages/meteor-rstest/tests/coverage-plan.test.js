const assert = require('node:assert/strict');
const test = require('node:test');

const {
  coveragePolicyFromConfig,
  coveragePlanFromConfig,
  stripCoverageCliArgs,
} = require('../src/coverage/plan.js');

const options = {
  cliEnabled: true,
  generation: 'g1',
  root: '/app',
  artifactRoot: '/app/.meteor/local/rstest/coverage/g1',
  hasMeteorRuntime: true,
};

test('projects enabled Istanbul coverage into the JSON-safe Meteor plan', () => {
  assert.deepEqual(coveragePlanFromConfig({ coverage: { provider: 'istanbul' } }, options), {
    schemaVersion: 1,
    generation: 'g1',
    enabled: true,
    provider: 'istanbul',
    root: '/app',
    include: [],
    exclude: [],
    allowExternal: false,
    artifactRoot: '/app/.meteor/local/rstest/coverage/g1',
    policy: {
      schemaVersion: 1,
      enabled: true,
      provider: 'istanbul',
      reporters: ['text', 'html', 'clover', 'json'],
      reportsDirectory: 'coverage',
      include: [],
      exclude: [],
      reportOnFailure: false,
      clean: true,
      allowExternal: false,
    },
  });
});

test('uses config coverage.enabled without requiring the CLI flag', () => {
  assert.deepEqual(coveragePlanFromConfig({
    coverage: {
      enabled: true,
      include: ['imports/**/*.js'],
      exclude: ['**/*.test.js'],
      allowExternal: true,
    },
  }, { ...options, cliEnabled: false }), {
    schemaVersion: 1,
    generation: 'g1',
    enabled: true,
    provider: 'istanbul',
    root: '/app',
    include: ['imports/**/*.js'],
    exclude: ['**/*.test.js'],
    allowExternal: true,
    artifactRoot: '/app/.meteor/local/rstest/coverage/g1',
    policy: {
      schemaVersion: 1,
      enabled: true,
      provider: 'istanbul',
      reporters: ['text', 'html', 'clover', 'json'],
      reportsDirectory: 'coverage',
      include: ['imports/**/*.js'],
      exclude: ['**/*.test.js'],
      reportOnFailure: false,
      clean: true,
      allowExternal: true,
    },
  });
});

test('keeps V8 coverage valid for native-only runs', () => {
  assert.equal(coveragePlanFromConfig({ coverage: { enabled: true, provider: 'v8' } }, {
    ...options,
    cliEnabled: false,
    hasMeteorRuntime: false,
  }).provider, 'v8');
});

test('rejects V8 coverage before a Meteor-hosted run compiles', () => {
  assert.throws(
    () => coveragePlanFromConfig({ coverage: { enabled: true, provider: 'v8' } }, {
      ...options,
      cliEnabled: false,
    }),
    error => error.code === 'METEOR_RSTEST_COVERAGE_PROVIDER_UNSUPPORTED' && /Istanbul/.test(error.message),
  );
});

test('rejects non-string coverage filters rather than serializing them into a host plan', () => {
  assert.throws(
    () => coveragePlanFromConfig({ coverage: { enabled: true, include: ['imports/**/*.js', 1] } }, options),
    error => error.code === 'METEOR_RSTEST_INVALID_COVERAGE_FILTER',
  );
});

test('produces an inert plan when coverage is disabled', () => {
  assert.deepEqual(coveragePlanFromConfig({ coverage: { enabled: false, provider: 'v8' } }, {
    ...options,
    cliEnabled: false,
  }), {
    schemaVersion: 1,
    generation: 'g1',
    enabled: false,
    provider: 'v8',
    root: '/app',
    include: [],
    exclude: [],
    allowExternal: false,
    artifactRoot: '/app/.meteor/local/rstest/coverage/g1',
    policy: {
      schemaVersion: 1,
      enabled: false,
      provider: 'v8',
      reporters: ['text', 'html', 'clover', 'json'],
      reportsDirectory: 'coverage',
      include: [],
      exclude: [],
      reportOnFailure: false,
      clean: true,
      allowExternal: false,
    },
  });
});

test('canonical coverage policy applies every upstream CLI override once', () => {
  const cliArgs = [
    '--coverage.enabled',
    '--coverage.provider=istanbul',
    '--coverage.reporters', 'text',
    '--coverage.reporters=json',
    '--coverage.thresholds.lines=91',
    '--coverage.reportsDirectory', 'cli-coverage',
    '--coverage.include=imports/cli/**/*.js',
    '--coverage.exclude', '**/generated/**',
    '--coverage.reportOnFailure',
    '--retry', '2',
  ];
  const policy = coveragePolicyFromConfig({
    coverage: {
      enabled: false,
      provider: 'v8',
      reporters: ['html'],
      thresholds: { lines: 5 },
      reportsDirectory: 'config-coverage',
      include: ['imports/config/**/*.js'],
      exclude: ['**/config-generated/**'],
      reportOnFailure: false,
    },
  }, {
    cliArgs,
    hasMeteorRuntime: true,
  });

  assert.deepEqual(policy, {
    schemaVersion: 1,
    enabled: true,
    provider: 'istanbul',
    reporters: ['text', 'json'],
    thresholds: { lines: 91 },
    reportsDirectory: 'cli-coverage',
    include: ['imports/cli/**/*.js'],
    exclude: ['**/generated/**'],
    reportOnFailure: true,
    clean: true,
    allowExternal: false,
  });
  assert.deepEqual(stripCoverageCliArgs(cliArgs), ['--retry', '2']);
});
