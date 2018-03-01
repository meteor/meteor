Package.describe({
  summary: "Logging facility.",
  version: '1.1.19'
});

Npm.depends({
  "cli-color": "0.2.3"
});

Npm.strip({
  "es5-ext": ["test/"]
});

Cordova.depends({
  'cordova-plugin-console': '1.1.0' // Deprecated, remove in future
});

Package.onUse(function (api) {
  api.export('Log');
  api.use(['underscore', 'ejson', 'modules']);
  api.addFiles('logging.js');
  api.addFiles('logging_cordova.js', 'web.cordova');
});

Package.onTest(function (api) {
  api.use(['tinytest', 'underscore', 'ejson']);
  api.use('logging', ['client', 'server']);
  api.addFiles('logging_test.js', ['server', 'client']);
});
