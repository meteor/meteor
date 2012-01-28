Package.describe({
  summary: "Logging facility.",
  internal: true
});

Package.on_use(function (api, where) {
  where = where || ['client', 'server'];
  api.add_files('logging.js', where);
});

Package.on_test(function (api) {
  api.use('logging', 'client');
  api.add_files('logging_test.js', 'client');
});
