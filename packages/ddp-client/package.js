Package.describe({
  summary: "Meteor's latency-compensated distributed data client",
  version: '2.2.0',
  documentation: null
});

Npm.depends({
  'faye-websocket': '0.11.1',
  lolex: '1.4.0',
  'permessage-deflate': '0.1.6'
});

Package.onUse((api) => {
  api.use([
    'check',
    'random',
    'ejson',
    'tracker',
    'retry',
    'id-map',
    'ecmascript',
    'callback-hook',
    'ddp-common',
    'reload',

    // we depend on _diffObjects, _applyChanges,
    'diff-sequence',

    // _idParse, _idStringify.
    'mongo-id'
  ], ['client', 'server']);

  api.use('reload', 'client', { weak: true });

  // For backcompat where things use Package.ddp.DDP, etc
  api.export('DDP');
  api.mainModule('client/client.js', 'client');
  api.mainModule('server/server.js', 'server');
});

Package.onTest((api) => {
  api.use([
    'livedata',
    'mongo',
    'test-helpers',
    'ecmascript',
    'underscore',
    'tinytest',
    'random',
    'tracker',
    'reactive-var',
    'mongo-id',
    'diff-sequence',
    'ejson',
    'ddp-common',
    'check'
  ]);

  api.use('http', 'client');

  api.addFiles('test/stub_stream.js');
  api.addFiles('test/livedata_connection_tests.js');
  api.addFiles('test/livedata_tests.js');
  api.addFiles('test/livedata_test_service.js');
  api.addFiles('test/random_stream_tests.js');
  api.addFiles('test/stream_tests.js', 'client');
  api.addFiles('test/stream_client_tests.js', 'server');
});
