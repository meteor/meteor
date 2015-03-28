Package.describe({
  summary: "Make HTTP calls to remote servers",
  version: '1.1.0'
});

Npm.depends({request: "2.53.0"});

Package.onUse(function (api) {
  api.use('underscore');
  api.use('url');
  api.export('HTTP');
  api.export('HTTPInternals', 'server');
  api.addFiles('httpcall_common.js', ['client', 'server']);
  api.addFiles('httpcall_client.js', 'client');
  api.addFiles('httpcall_server.js', 'server');
  api.addFiles('deprecated.js', ['client', 'server']);
});

Package.onTest(function (api) {
  api.use('webapp', 'server');
  api.use('underscore');
  api.use('random');
  api.use('jquery', 'client');
  api.use('http', ['client', 'server']);
  api.use('tinytest');
  api.use('test-helpers', ['client', 'server']);

  api.addFiles('test_responder.js', 'server');
  api.addFiles('httpcall_tests.js', ['client', 'server']);
  api.addFiles('test_static.serveme', 'client');
});
