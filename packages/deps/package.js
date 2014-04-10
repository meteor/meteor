// XXX rename package?

Package.describe({
  name: "deps",
  test: "deps-test",
  summary: "Dependency mananger to allow reactive callbacks",
  version: '1.0.0',
  internal: true
});

Package.on_use(function (api) {
  api.use('underscore');
  api.export('Deps');
  api.add_files('deps.js');
  api.add_files('deprecated.js');
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('deps');
  api.add_files('deps_tests.js', 'client');
});
