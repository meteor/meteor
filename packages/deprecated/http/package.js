Package.describe({
  summary: "Make HTTP calls to remote servers",
  version: '3.0.0',
  deprecated: 'Please use the fetch package'
});

Package.onUse(function (api) {
  api.use([
    'url@1.3.2',
    'ecmascript@0.16.8-beta300.7',
    'fetch@0.1.4-beta300.7',
    'modules@0.19.1-beta300.7'
  ]);

  api.mainModule('httpcall_client.js', 'client');
  api.mainModule('httpcall_server.js', 'server');

  api.export('HTTP');
  api.export('HTTPInternals', 'server');
});

Npm.depends({
  "express-basic-auth": "1.2.1"
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
