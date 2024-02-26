Package.describe({
  summary: "Code shared beween ddp-client and ddp-server",
  version: '1.4.1-beta300.4',
  documentation: null
});

Package.onUse(function (api) {
  api.use([
    'check',
    'random',
    'ecmascript',
    'ejson',
    'tracker',
    'retry',
  ], ['client', 'server']);

  api.addFiles('namespace.js');

  api.addFiles('heartbeat.js', ['client', 'server']);
  api.addFiles('utils.js', ['client', 'server']);
  api.addFiles('method_invocation.js', ['client', 'server']);
  api.addFiles('random_stream.js', ['client', 'server']);

  api.export('DDPCommon');
});

Package.onTest(function (api) {
  // XXX we should write unit tests for heartbeat
});
