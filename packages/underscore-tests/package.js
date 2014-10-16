Package.describe({
  // These tests can't be directly in the underscore packages since
  // Tinytest depends on underscore
  summary: "Tests for the underscore package",
  version: '1.0.1'
});

Package.on_test(function (api) {
  api.use(['tinytest', 'underscore']);
  api.add_files('each_test.js');
});
