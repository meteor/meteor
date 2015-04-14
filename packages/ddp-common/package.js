Package.describe({
  summary: "Meteor's latency-compensated distributed data framework",
  version: '1.2.0'
});

Package.onUse(function (api) {
  api.use(['check', 'random', 'ejson', 'json', 'underscore', 'tracker',
           'logging', 'retry'],
          ['client', 'server']);

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
