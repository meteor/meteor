Package.describe({
  name: 'thread-context',
  summary: 'Transparent worker thread bridge for Meteor server APIs',
  version: '0.1.0',
  git: 'https://github.com/meteor/meteor',
});

Package.onUse(function (api) {
  api.versionsFrom(['3.0']);
  api.use('ecmascript');
  api.use('ejson', 'server');
  api.use('mongo', 'server');
  api.use('ddp-server', 'server');
  api.use('ddp-common', 'server');
  api.use('meteor', 'server');

  api.mainModule('thread-context.js', 'server');
  api.addAssets('thread-context.d.ts', 'server');
  api.addAssets('package-types.json', 'server');
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
  api.addFiles('tests/shutdown-test.js', 'server');
});
