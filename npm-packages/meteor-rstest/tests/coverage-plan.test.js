const assert = require('node:assert/strict');
const test = require('node:test');

const {
  coveragePlanFromConfig,
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
  });
});
