Package.describe({
  summary: "Logging facility.",
  internal: true
});

Npm.depends({
  "cli-color": "0.2.3"
});

Package.on_use(function (api) {
  api.export('Log');
  api.use(['underscore', 'ejson']);
  api.add_files('logging.js');
});

Package.on_test(function (api) {
  api.use(['tinytest', 'underscore', 'ejson']);
  api.use('logging', ['client', 'server']);
  api.add_files('logging_test.js', ['server', 'client']);
});
