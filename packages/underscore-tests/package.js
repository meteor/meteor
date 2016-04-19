Package.describe({
  // These tests can't be directly in the underscore packages since
  // Tinytest depends on underscore
  summary: "Tests for the underscore package",
  version: '1.0.8'
});

Package.onTest(function (api) {
  api.use(['tinytest', 'underscore']);
  api.addFiles('each_test.js');
});
