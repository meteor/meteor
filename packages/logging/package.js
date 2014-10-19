Package.describe({
  summary: "Logging facility.",
  version: '1.0.4'
});

Npm.depends({
  "cli-color": "0.2.3"
});

Npm.strip({
  "es5-ext": ["test/"]
});

Cordova.depends({
  'org.apache.cordova.console': '0.2.10'
});

Package.on_use(function (api) {
  api.export('Log');
  api.use(['underscore', 'ejson']);
  api.add_files('logging.js');
  api.add_files('logging_cordova.js', 'web.cordova');
});

Package.on_test(function (api) {
  api.use(['tinytest', 'underscore', 'ejson']);
  api.use('logging', ['client', 'server']);
  api.add_files('logging_test.js', ['server', 'client']);
});
