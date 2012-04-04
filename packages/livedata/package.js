Package.describe({
  summary: "Meteor's latency-compensated distributed data framework",
  internal: true
});

Package.on_use(function (api) {
  api.use(['stream', 'uuid']);
  api.use(['json', 'underscore', 'deps', 'logging'], ['client', 'server']);

  // livedata_connection.js uses a Minimongo collection internally to
  // manage the current set of subscriptions.
  api.use('minimongo', ['client', 'server']);

  api.add_files('writefence.js', 'server');
  api.add_files('crossbar.js', 'server');

  api.add_files('livedata_common.js', ['client', 'server']);

  api.add_files('livedata_connection.js', 'client');

  api.add_files('livedata_server.js', 'server');


  api.add_files('client_convenience.js', 'client');
  api.add_files('server_convenience.js', 'server');
});

Package.on_test(function (api) {
  api.use('livedata', ['client', 'server']);
  api.use('mongo-livedata', ['client', 'server']);
  api.use('test-helpers', ['client', 'server']);
  api.use('tinytest');

  api.add_files('livedata_connection_tests.js', ['client']);
  api.add_files('livedata_tests.js', ['client', 'server']);
  api.add_files('livedata_test_service.js', ['client', 'server']);
});
