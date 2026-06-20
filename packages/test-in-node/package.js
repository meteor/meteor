Package.describe({
  name: 'test-in-node',
  summary: 'Run package tests with the Node.js native test runner (node:test)',
  version: '0.0.1',
});

Package.onUse(function (api) {
  api.use('ecmascript', 'server');
  api.addFiles('driver.js', 'server');
  // reporter.mjs is intentionally a loose file (loaded by Node via --test-reporter),
  // not added here — bundling it would break standalone loading.
});

Package.onTest(function (api) {
  api.use(['test-in-node', 'ecmascript', 'random'], 'server');
  api.addFiles('tests.js', 'server');
});
