Package.describe({
  // These tests can't be directly in the underscore packages since
  // Tinytest depends on underscore
  summary: "Tests for the underscore package",
  version: '2.0.0-alpha300.7',
});

Package.onTest(function (api) {
  api.use(['tinytest', 'underscore']);
  api.addFiles('each_test.js');
});
