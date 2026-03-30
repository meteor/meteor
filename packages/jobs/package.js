Package.describe({
  name: 'jobs',
  summary: 'Distributed job scheduling and execution for Meteor',
  version: '0.1.0',
  git: 'https://github.com/meteor/meteor',
});

Npm.depends({
  croner: '10.0.1',
  ms: '2.1.3',
});

Package.onUse(function (api) {
  api.use('ecmascript');
  api.use('ejson', 'server');
  api.use('check', 'server');
  api.use('random', 'server');
  api.use('mongo', 'server');
  api.use('callback-hook', 'server');

  api.use('worker-pool', 'server', { weak: true });

  api.mainModule('jobs-server.js', 'server');

  api.addAssets('jobs.d.ts', 'server');
  api.addAssets('package-types.json', 'server');
});

Package.onTest(function (api) {
  api.use('ecmascript');
  api.use('tinytest');
  api.use('test-helpers');
  api.use('mongo', 'server');
  api.use('check', 'server');
  api.use('random', 'server');
  api.use('jobs', 'server');

  api.addFiles([
    'tests/registration-test.js',
    'tests/scheduling-test.js',
    'tests/execution-test.js',
    'tests/retry-test.js',
    'tests/dedup-test.js',
    'tests/claiming-test.js',
    'tests/leader-test.js',
    'tests/lifecycle-test.js',
    'tests/recovery-test.js',
    'tests/publication-test.js',
    'tests/api-test.js',
    'tests/cron-test.js',
  ], 'server');
});
