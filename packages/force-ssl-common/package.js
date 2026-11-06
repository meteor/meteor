Package.describe({
  summary: 'Internal force-ssl common code.',
  version: '1.1.2-rc360.1',
});

Package.onUse(function (api) {
  api.use('ecmascript');
  api.mainModule('force_ssl_common.js', 'server');
  api.types('force-ssl-common.d.ts');
});

Package.onTest(function (api) {
  api.use('ecmascript');
  api.use('tinytest');
  api.mainModule('force_ssl_tests.js', 'server');
  api.addFiles('forwarded_tests.js', 'server');
});
