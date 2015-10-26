Package.describe({
  summary: "Meteor's latency-compensated distributed data server",
  version: '1.2.2',
  documentation: null
});

Npm.depends({
  "permessage-deflate": "0.1.3",
  sockjs: "0.3.14"
});

Package.onUse(function (api) {
  api.use(['check', 'random', 'ejson', 'underscore',
           'retry', 'mongo-id', 'diff-sequence', 'ecmascript'],
          'server');

  // common functionality
  api.use('ddp-common', 'server'); // heartbeat
  api.use('ddp-rate-limiter', 'server', {weak: true});
  // Transport
  api.use('ddp-client', 'server');
  api.imply('ddp-client');

  api.use(['webapp', 'routepolicy'], 'server');

  // Detect whether or not the user wants us to audit argument checks.
  api.use(['audit-argument-checks'], 'server', {weak: true});

  // Allow us to detect 'autopublish', so we can print a warning if the user
  // runs Meteor.publish while it's loaded.
  api.use('autopublish', 'server', {weak: true});

  // If the facts package is loaded, publish some statistics.
  api.use('facts', 'server', {weak: true});

  api.use('callback-hook', 'server');

  // we depend on LocalCollection._diffObjects, _applyChanges,
  // _idParse, _idStringify.
  api.use('minimongo', 'server');

  api.export('DDPServer', 'server');

  api.addFiles('stream_server.js', 'server');

  api.addFiles('livedata_server.js', 'server');
  api.addFiles('writefence.js', 'server');
  api.addFiles('crossbar.js', 'server');

  api.addFiles('server_convenience.js', 'server');
});



Package.onTest(function (api) {
  api.use('ecmascript', ['client', 'server']);
  api.use('livedata', ['client', 'server']);
  api.use('mongo', ['client', 'server']);
  api.use('test-helpers', ['client', 'server']);
  api.use(['underscore', 'tinytest', 'random', 'tracker', 'minimongo', 'reactive-var']);

  api.addFiles('livedata_server_tests.js', 'server');
  api.addFiles('session_view_tests.js', ['server']);
  api.addFiles('crossbar_tests.js', ['server']);
});
