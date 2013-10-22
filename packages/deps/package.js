// XXX rename package?

Package.describe({
  summary: "Dependency mananger to allow reactive callbacks",
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
