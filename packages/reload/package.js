Package.describe({
  summary: "Reload the page while preserving application state.",
  version: '1.1.1'
});

Package.on_use(function (api) {
  api.use(['underscore', 'logging', 'json'], 'client');
  api.export('Reload', 'client');
  api.add_files('reload.js', 'client');
  api.add_files('deprecated.js', 'client');
});

Package.on_test(function (api) {
  api.use(['tinytest', 'reload'], 'client');
  api.add_files('reload_tests.js', 'client');
});
