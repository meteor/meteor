Package.describe({
  name: 'node-test-poc',
  summary: 'POC: test a Meteor package with node:test',
  version: '0.0.1',
  testOnly: true,
});

Package.onUse(function (api) {
  api.use('ecmascript', 'server');
  api.mainModule('main.js', 'server');
});

Package.onTest(function (api) {
  api.use(['ecmascript', 'random'], 'server');
  // NO tinytest — using node:test instead
  api.addFiles([
    'tests.js',            // Basic: assert + describe/it
    'tests-mock.js',       // Mocking: mock.fn(), mock.method(), mock.timers
    'tests-coverage.js',   // Coverage: branching code (run with --experimental-test-coverage)
    'tests-snapshot.js',   // Snapshots: t.assert.snapshot() (run with --experimental-test-snapshots)
    'tests-filtering.js',  // Filtering: skip, todo, only, name patterns
    'tests-perf.js',       // Perf: concurrency, timeouts, sharding
    'tests-reporters.js',  // Reporters: spec, TAP, dot, JUnit, custom
  ], 'server');
});
