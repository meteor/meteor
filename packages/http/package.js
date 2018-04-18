Package.describe({
  summary: "Make HTTP calls to remote servers",
  version: '1.4.1'
});

Npm.depends({
  request: "2.83.0"
});

Package.onUse(function (api) {
  api.use([
    'url',
    // This package intentionally does not depend on ecmascript, so that
    // ecmascript and its dependencies can depend on http without creating
    // package dependency cycles.
    'modules'
  ]);

  api.mainModule('httpcall_client.js', 'client');
  api.mainModule('httpcall_server.js', 'server');

  api.export('HTTP');
  api.export('HTTPInternals', 'server');
});

Package.onTest(function (api) {
  api.use('ecmascript');
  api.use('webapp', 'server');
  api.use('underscore');
  api.use('random');
  api.use('http', ['client', 'server']);
  api.use('tinytest');
  api.use('test-helpers', ['client', 'server']);

  api.addFiles('test_responder.js', 'server');
  api.addFiles('httpcall_tests.js', ['client', 'server']);

  api.addAssets('test_static.serveme', 'client');
});
