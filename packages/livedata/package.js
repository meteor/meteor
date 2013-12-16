Package.describe({
  summary: "Meteor's latency-compensated distributed data framework",
  internal: true
});

Npm.depends({sockjs: "0.3.8", websocket: "1.0.8"});

Package.on_use(function (api) {
  api.use(['check', 'random', 'ejson', 'json', 'underscore', 'deps',
           'logging', 'retry'],
          ['client', 'server']);

  // It is OK to use this package on a server architecture without making a
  // server (in order to do server-to-server DDP as a client). So these are only
  // included as weak dependencies.
  // XXX split this package into multiple packages or multiple slices instead
  api.use(['webapp', 'routepolicy'], 'server', {weak: true});

  // Detect whether or not the user wants us to audit argument checks.
  api.use(['audit-argument-checks'], 'server', {weak: true});

  // Allow us to detect 'autopublish', so we can print a warning if the user
  // runs Meteor.publish while it's loaded.
  api.use('autopublish', 'server', {weak: true});

  // If the facts package is loaded, publish some statistics.
  api.use('facts', 'server', {weak: true});

  api.export('DDP');
  api.export('DDPServer', 'server');

  api.export('LivedataTest', {testOnly: true});

  // Transport
  api.use('reload', 'client', {weak: true});
  api.add_files('common.js');
  api.add_files(['sockjs-0.3.4.js', 'stream_client_sockjs.js'], 'client');
  api.add_files('stream_client_nodejs.js', 'server');
  api.add_files('stream_client_common.js', ['client', 'server']);
  api.add_files('stream_server.js', 'server');

  // we depend on LocalCollection._diffObjects, _applyChanges,
  // _idParse, _idStringify.
  api.use('minimongo', ['client', 'server']);


  api.add_files('livedata_server.js', 'server');

  api.add_files('writefence.js', 'server');
  api.add_files('crossbar.js', 'server');

  api.add_files('livedata_common.js', ['client', 'server']);

  api.add_files('livedata_connection.js', ['client', 'server']);


  api.add_files('client_convenience.js', 'client');
  api.add_files('server_convenience.js', 'server');
});

Package.on_test(function (api) {
  api.use('livedata', ['client', 'server']);
  api.use('mongo-livedata', ['client', 'server']);
  api.use('test-helpers', ['client', 'server']);
  api.use(['underscore', 'tinytest', 'random', 'deps', 'minimongo']);

  api.add_files('stub_stream.js');
  api.add_files('livedata_server_tests.js', 'server');
  api.add_files('livedata_connection_tests.js', ['client', 'server']);
  api.add_files('livedata_tests.js', ['client', 'server']);
  api.add_files('livedata_test_service.js', ['client', 'server']);
  api.add_files('session_view_tests.js', ['server']);
  api.add_files('crossbar_tests.js', ['server']);

  api.use('http', 'client');
  api.add_files(['stream_tests.js'], 'client');
  api.add_files('stream_client_tests.js', 'server');
  api.use('check', ['client', 'server']);
});
