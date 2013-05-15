Package.describe({
  summary: "Logging facility.",
  internal: true
});

Npm.depends({
  "cli-color": "0.2.2"
});

Package.on_use(function (api, where) {
  where = where || ['client', 'server'];
  api.use(['underscore', 'ejson'], where);
  api.add_files('debug.js', where);
  api.add_files('logging.js', where);
});

Package.on_test(function (api) {
  api.use(['tinytest', 'underscore', 'ejson']);
  api.use('logging', ['client', 'server']);
  api.add_files('debug_test.js', 'client');
  api.add_files('logging_test.js', 'server');
});
