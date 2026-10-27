Package.describe({
  summary: 'Internal force-ssl common code.',
  version: '1.1.1_1',
});

Package.onUse(function (api) {
  // Keep the published dependency floors for independent package updates.
  api.use('meteor@2.0.0');
  api.use('ecmascript@0.16.9');
  api.mainModule('force_ssl_common.js', 'server');
});

Package.onTest(function (api) {
  api.use('ecmascript');
  api.use('tinytest');
  api.mainModule('force_ssl_tests.js', 'server');
  api.addFiles('forwarded_tests.js', 'server');
});
