Package.describe({
  summary: "Make HTTP calls to remote servers",
  version: '1.4.3'
});

Package.onUse(function (api) {
  api.versionsFrom('1.12.1');
  api.use([
    'url',
    'ecmascript',
    'modules',
    'fetch',
    'logging' // For deprecation message
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
