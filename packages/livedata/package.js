Package.describe({
  summary: "Meteor's latency-compensated distributed data framework",
  internal: true
});

Npm.depends({sockjs: "0.3.4",
             websocket: "1.0.7"});

Package.on_use(function (api) {
  api.use(['random', 'ejson', 'json', 'underscore', 'deps', 'logging'],
          ['client', 'server']);

  // Transport
  api.use('reload', 'client');
  api.use('routepolicy', 'server');
  api.add_files(['sockjs-0.3.4.js',
                 'stream_client_sockjs.js'], 'client');
  api.add_files('stream_client_nodejs.js', 'client');
  api.add_files('stream_server.js', 'server');

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
  api.add_files('session_view_tests.js', ['server']);
  api.add_files('crossbar_tests.js', ['server']);

  api.use('http', 'client');
  api.add_files(['stream_tests.js'], 'client');
});
