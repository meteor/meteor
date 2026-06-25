Package.describe({
  summary: "Helpers for managing modern tools in Meteor",
  version: '1.1.0',
  devOnly: true,
});

Package.onUse(function (api) {
  api.use('ecmascript', ['client', 'server']);

  api.mainModule('tools-core.js', 'server');
});

Package.onTest(function (api) {
  api.use(['ecmascript', 'tinytest']);
  api.use('tools-core');

  // Add test files for each lib/ module
  // This structure allows easy addition of tests for other lib/ categories
  api.addFiles([
    'tests/meteor_tests.js',
    'tests/deps_tests.js',
  ], 'server');
});
