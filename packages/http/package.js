Package.describe({
  summary: "Make HTTP calls to remote servers"
});

Package.on_use(function (api) {
  api.use('underscore');
  api.export('HTTP');
  api.add_files('httpcall_common.js', ['client', 'server']);
  api.add_files('httpcall_client.js', 'client');
  api.add_files('httpcall_server.js', 'server');
  api.add_files('deprecated.js', ['client', 'server']);
});

Package.on_test(function (api) {
  api.use('webapp', 'server');
  api.use('underscore');
  api.use('random');
  api.use('jquery', 'client');
  api.use('http', ['client', 'server']);
  api.use('test-helpers', ['client', 'server']);

  api.add_files('test_responder.js', 'server');
  api.add_files('httpcall_tests.js', ['client', 'server']);
  api.add_files('test_static.serveme', 'client');
});
