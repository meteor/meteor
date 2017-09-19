Package.describe({
  summary: "Meteor's latency-compensated distributed data client",
  version: '2.1.3',
  documentation: null
});

Npm.depends({
  "faye-websocket": "0.11.1",
  "lolex": "1.4.0",
  "permessage-deflate": "0.1.6"
});

Package.onUse(function (api) {
  api.use(['check', 'random', 'ejson', 'underscore', 'tracker',
           'retry', 'id-map', 'ecmascript'],
          ['client', 'server']);

  api.use('callback-hook', ['client', 'server']);

  // common functionality
  api.use('ddp-common', ['client', 'server']);

  api.use('reload', 'client', {weak: true});

  // we depend on _diffObjects, _applyChanges,
  api.use('diff-sequence', ['client', 'server']);
  // _idParse, _idStringify.
  api.use('mongo-id', ['client', 'server']);

  api.addFiles(['sockjs-0.3.4.js', 'stream_client_sockjs.js'], 'client');
  api.addFiles('stream_client_nodejs.js', 'server');
  api.addFiles('stream_client_common.js', ['client', 'server']);

  api.addFiles('livedata_common.js', ['client', 'server']);
  api.addFiles('random_stream.js', ['client', 'server']);

  api.addFiles('livedata_connection.js', ['client', 'server']);

  api.addFiles('client_convenience.js', 'client');

  api.mainModule("namespace.js");
  api.export('DDP');
});

Package.onTest(function (api) {
  api.use('livedata', ['client', 'server']);
  api.use('mongo', ['client', 'server']);
  api.use('test-helpers', ['client', 'server']);
  api.use([
    'ecmascript',
    'underscore',
    'tinytest',
    'random',
    'tracker',
    'reactive-var',
    'mongo-id',
    'diff-sequence',
    'ejson'
  ]);

  api.addFiles('stub_stream.js');
  api.addFiles('livedata_connection_tests.js', ['client', 'server']);
  api.addFiles('livedata_tests.js', ['client', 'server']);
  api.addFiles('livedata_test_service.js', ['client', 'server']);
  api.addFiles('random_stream_tests.js', ['client', 'server']);

  api.use('http', 'client');
  api.addFiles(['stream_tests.js'], 'client');
  api.addFiles('stream_client_tests.js', 'server');
  api.use('check', ['client', 'server']);
});
