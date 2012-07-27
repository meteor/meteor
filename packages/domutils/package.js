Package.describe({
  summary: "Utility functions for DOM manipulation",
  internal: true
});

Package.on_use(function (api) {
  api.add_files('domutils.js', 'client');
});

Package.on_test(function (api) {
  api.use(['tinytest']);
  api.use(['domutils', 'test-helpers'], 'client');

  api.add_files([
    'domutils_tests.js'
  ], 'client');
});
