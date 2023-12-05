Package.describe({
  summary: 'Logging facility.',
  version: '1.3.3-alpha300.19',
});

Npm.depends({
  'chalk': '5.3.0'
});

Npm.strip({
  'es5-ext': ['test/']
});

Package.onUse(function (api) {
  api.export('Log');
  api.use(['ejson', 'ecmascript']);
  api.mainModule('logging.js');
  api.addFiles('logging_server.js', 'server');
  api.addFiles('logging_browser.js', 'client');
  api.mainModule('logging_cordova.js', 'web.cordova');
});

Package.onTest(function (api) {
  api.use(['tinytest', 'ejson', 'ecmascript']);
  api.use('logging', ['client', 'server']);
  api.mainModule('logging_test.js', ['server', 'client']);
});
