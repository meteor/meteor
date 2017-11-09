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

Package.onUse(function(api) {
  api.use(
    [
      'check',
      'random',
      'ejson',
      'underscore',
      'tracker',
      'retry',
      'id-map',
      'ecmascript'
    ],
    ['client', 'server']
  );

  api.use('callback-hook', ['client', 'server']);

  // common functionality
  api.use('ddp-common', ['client', 'server']);

  api.use('reload', 'client', { weak: true });

  // we depend on _diffObjects, _applyChanges,
  api.use('diff-sequence', ['client', 'server']);
  // _idParse, _idStringify.
  api.use('mongo-id', ['client', 'server']);

  // For backcompat where things use Package.ddp.DDP, etc
  api.export('DDP');
  api.mainModule('client/client.js', 'client');
  api.mainModule('server/server.js', 'server');
});

Package.onTest(function(api) {
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

  api.addFiles('test/stub_stream.js');
  api.addFiles('test/livedata_connection_tests.js', ['client', 'server']);
  api.addFiles('test/livedata_tests.js', ['client', 'server']);
  api.addFiles('test/livedata_test_service.js', ['client', 'server']);
  api.addFiles('test/random_stream_tests.js', ['client', 'server']);

  api.use('http', 'client');
  api.addFiles('test/stream_tests.js', 'client');
  api.addFiles('test/stream_client_tests.js', 'server');
  api.use('check', ['client', 'server']);
});
