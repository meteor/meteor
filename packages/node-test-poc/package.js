Package.describe({
  name: 'node-test-poc',
  summary: 'POC: test a Meteor package with node:test',
  version: '0.0.1',
  testOnly: true,
});

Package.onUse(function (api) {
  api.use('ecmascript', 'server');
  api.mainModule('main.js', 'server');
});

Package.onTest(function (api) {
  api.use(['ecmascript', 'random'], 'server');
  // NO tinytest — using node:test instead
  api.addFiles('tests.js', 'server');
});
