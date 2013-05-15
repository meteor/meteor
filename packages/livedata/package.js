Package.describe({
  summary: "Meteor's latency-compensated distributed data framework",
  internal: true
});

Npm.depends({sockjs: "0.3.7",
             websocket: "1.0.7"});

Package.on_use(function (api) {
  api.use(['check', 'random', 'ejson', 'json', 'underscore', 'deps', 'logging'],
          ['client', 'server']);

  // XXX we do NOT require webapp or routepolicy here, because it's OK to use
  // this package on a server architecture without making a server (in order to
  // do server-to-server DDP as a client). So if you want to provide a DDP
  // server, you need to use webapp before you use livedata.

  // Transport
  api.use('reload', 'client');
  api.add_files(['sockjs-0.3.4.js',
                 'stream_client_sockjs.js'], 'client');
  api.add_files('stream_client_nodejs.js', 'server');
  api.add_files('stream_client_common.js', ['client', 'server']);
  api.add_files('stream_server.js', 'server');

  // we depend on LocalCollection._diffObjects and ._applyChanges.
  api.use('minimongo', ['client', 'server']);

  api.add_files('writefence.js', 'server');
  api.add_files('crossbar.js', 'server');

  api.add_files('livedata_common.js', ['client', 'server']);

  api.add_files('livedata_connection.js', ['client', 'server']);

  api.add_files('livedata_server.js', 'server');


  api.add_files('client_convenience.js', 'client');
  api.add_files('server_convenience.js', 'server');
});

Package.on_test(function (api) {
  api.use('livedata', ['client', 'server']);
  api.use('mongo-livedata', ['client', 'server']);
  api.use('test-helpers', ['client', 'server']);
  api.use(['underscore', 'tinytest', 'random', 'deps']);

  api.add_files('livedata_connection_tests.js', ['client', 'server']);
  api.add_files('livedata_tests.js', ['client', 'server']);
  api.add_files('livedata_test_service.js', ['client', 'server']);
  api.add_files('session_view_tests.js', ['server']);
  api.add_files('crossbar_tests.js', ['server']);

  api.use('http', 'client');
  api.add_files(['stream_tests.js'], 'client');
  api.use('check', ['client', 'server']);
});
