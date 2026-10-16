Package.describe({
  name: 'test-in-node',
  summary: 'Run package tests with the Node.js native test runner (node:test)',
  version: '0.0.1',
});

Package.onUse(function (api) {
  api.use('ecmascript', 'server');
  api.addFiles('driver.js', 'server');
  // The node:test reporter is NOT part of this package: node:test reporters must be
  // resolved by Node at process startup, so the Meteor tool ships it under tools/ and
  // auto-attaches it (see tools/runners/run-app.js). Resolving a loose file from an
  // isopack would make the driver fragile.
});

Package.onTest(function (api) {
  api.use(['test-in-node', 'ecmascript', 'random'], 'server');
  api.addFiles('tests.js', 'server');
});
