Package.describe({
  name: 'instrumentation',
  version: '0.0.1',
  summary: 'Read-only lifecycle instrumentation seam (methods, publications, DDP connections)',
});

Package.onUse(function (api) {
  // Note: deliberately NO dependency on ddp-server (which weakly depends on us).
  // The connection wiring uses Meteor.onConnection at startup, by which point
  // ddp-server is loaded — avoiding a build-time cycle.
  api.use(['ecmascript', 'ddp-client', 'random', 'ejson'], 'server');
  api.mainModule('server.js', 'server');
  api.export('Instrumentation', 'server');
});

Package.onTest(function (api) {
  api.use(['ecmascript', 'tinytest', 'random', 'ddp-server', 'ddp-client', 'mongo', 'test-helpers'], 'server');
  api.use('instrumentation', 'server');
  api.mainModule('instrumentation_tests.js', 'server');
});
