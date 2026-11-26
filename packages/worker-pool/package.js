Package.describe({
  name: 'worker-pool',
  summary: 'Managed worker thread pool with automatic thread-context bridging',
  version: '0.1.0',
  git: 'https://github.com/meteor/meteor',
});

Package.onUse(function (api) {
  api.use('ecmascript');
  api.use('thread-context', 'server');

  api.mainModule('worker-pool.js', 'server');
  api.addAssets('worker-entry.js', 'server');

  api.addAssets('worker-pool.d.ts', 'server');
  api.addAssets('package-types.json', 'server');
});

Package.onTest(function (api) {
  api.use('ecmascript');
  api.use('tinytest');
  api.use('test-helpers');
  api.use('worker-pool', 'server');

  api.addFiles('tests/pool-test.js', 'server');
});
