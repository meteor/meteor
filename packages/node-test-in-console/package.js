Package.describe({
  name: 'node-test-in-console',
  summary: 'Test driver using the Node.js native test runner (node:test)',
  version: '1.0.0',
});

Package.onUse(function (api) {
  api.use('ecmascript', 'server');
  api.addFiles('server.js', 'server');
});
