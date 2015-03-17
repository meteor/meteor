Package.describe({
  summary: "Meteor's latency-compensated distributed data framework",
  version: '1.1.0'
});

// We use 'faye-websocket' for connections in server-to-server DDP, mostly
// because it's the same library used as a server in sockjs, and it's easiest to
// deal with a single websocket implementation.  (Plus, its maintainer is easy
// to work with on pull requests.)
//
// (By listing faye-websocket first, it's more likely that npm deduplication
// will prevent a second copy of faye-websocket from being installed inside
// sockjs.)
Npm.depends({
  "faye-websocket": "0.8.1",
  sockjs: "0.3.11"
});

Package.onUse(function (api) {
  api.use(['check', 'random', 'ejson', 'json', 'underscore', 'tracker',
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

  api.use('callback-hook', 'server');

  api.export('DDP');
  api.export('DDPServer', 'server');

  api.export('LivedataTest', {testOnly: true});

  // Transport
  api.use('reload', 'client', {weak: true});
  api.addFiles('common.js');
  api.addFiles(['sockjs-0.3.4.js', 'stream_client_sockjs.js'], 'client');
  api.addFiles('stream_client_nodejs.js', 'server');
  api.addFiles('stream_client_common.js', ['client', 'server']);
  api.addFiles('stream_server.js', 'server');

  // we depend on LocalCollection._diffObjects, _applyChanges,
  // _idParse, _idStringify.
  api.use('minimongo', ['client', 'server']);

  api.addFiles('heartbeat.js', ['client', 'server']);

  api.addFiles('livedata_server.js', 'server');

  api.addFiles('writefence.js', 'server');
  api.addFiles('crossbar.js', 'server');

  api.addFiles('livedata_common.js', ['client', 'server']);
  api.addFiles('random_stream.js', ['client', 'server']);

  api.addFiles('livedata_connection.js', ['client', 'server']);


  api.addFiles('client_convenience.js', 'client');
  api.addFiles('server_convenience.js', 'server');
});

Package.onTest(function (api) {
  api.use('livedata', ['client', 'server']);
  api.use('mongo', ['client', 'server']);
  api.use('test-helpers', ['client', 'server']);
  api.use(['underscore', 'tinytest', 'random', 'tracker', 'minimongo', 'reactive-var']);

  api.addFiles('stub_stream.js');
  api.addFiles('livedata_server_tests.js', 'server');
  api.addFiles('livedata_connection_tests.js', ['client', 'server']);
  api.addFiles('livedata_tests.js', ['client', 'server']);
  api.addFiles('livedata_test_service.js', ['client', 'server']);
  api.addFiles('session_view_tests.js', ['server']);
  api.addFiles('crossbar_tests.js', ['server']);
  api.addFiles('random_stream_tests.js', ['client', 'server']);

  api.use('http', 'client');
  api.addFiles(['stream_tests.js'], 'client');
  api.addFiles('stream_client_tests.js', 'server');
  api.use('check', ['client', 'server']);
});
