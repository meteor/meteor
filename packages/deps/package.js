// XXX rename package?

Package.describe({
  summary: "Dependency mananger to allow reactive callbacks",
  internal: true
});

Package.on_use(function (api, where) {
  where = where || ['client', 'server'];

  api.use('underscore', where);
  api.add_files(['deps.js', 'deps-utils.js'], where);
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('deps');
  api.add_files('deps_tests.js', 'client');
});
