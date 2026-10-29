Package.describe({
  name: 'thread-context',
  summary: 'Transparent worker thread bridge for Meteor server APIs',
  version: '0.1.0',
  git: 'https://github.com/meteor/meteor',
});

Package.onUse(function (api) {
  api.use('ecmascript');
  api.use('ejson', 'server');
  api.use('mongo', 'server');
  api.use('ddp-server', 'server');
  api.use('ddp-common', 'server');
  api.use('meteor', 'server');

  api.mainModule('thread-context.js', 'server');
  api.addAssets('thread-context.d.ts', 'server');
  api.addAssets('package-types.json', 'server');

  // Worker-side modules. A worker_threads Worker has no Meteor module system,
  // so these dependency-free ESM files ship as server assets and the worker
  // imports the entry via createThreadContext().workerData.bridgeModuleUrl.
  api.addAssets([
    'worker.js',
    'bridge-client.js',
    'deep-freeze.js',
    'errors.js',
    'protocol.js',
    'proxies/collection-proxy.js',
    'proxies/method-proxy.js',
  ], 'server');
});

Package.onTest(function (api) {
  api.use('ecmascript');
  api.use('tinytest');
  api.use('test-helpers');
  api.use('mongo', 'server');
  api.use('ddp-server', 'server');
  api.use('ddp-common', 'server');
  api.use('thread-context', 'server');

  api.addFiles('tests/error-test.js', 'server');
  api.addFiles('tests/bridge-test.js', 'server');
  api.addFiles('tests/collection-handler-test.js', 'server');
  api.addFiles('tests/method-handler-test.js', 'server');
  api.addFiles('tests/cursor-proxy-test.js', 'server');
  api.addFiles('tests/connection-proxy-test.js', 'server');
  api.addFiles('tests/hydrate-test.js', 'server');
  api.addFiles('tests/shutdown-test.js', 'server');
  api.addFiles('tests/worker-thread-test.js', 'server');
});
