Package.describe({
  name: "underscore-tests",
  test: "underscore-tests-test",
  name: "underscore-tests",
  test: "underscore-tests-test",
  // These tests can't be directly in the underscore packages since
  // Tinytest depends on underscore
  summary: "Tests for the underscore package",
  version: '1.0.0',
  internal: true
});

Package.on_test(function (api) {
  api.use(['tinytest', 'underscore']);
  api.add_files('each_test.js');
});
