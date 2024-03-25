Package.describe({
  summary: 'Logging facility.',
  documentation: 'README.md',
  version: '1.3.3',
});

Npm.depends({
  'chalk': '4.1.2'
});

Npm.strip({
  'es5-ext': ['test/']
});

Package.onUse(function (api) {
  api.export('Log');
  // The `ecmascript-runtime-client` package is explicitly depended upon
  // here due to this package's dependency on
  // `String.prototype.padRight` which is polyfilled only in
  // `ecmascript-runtime-client@0.6.2` or newer.
  api.use(['ejson', 'ecmascript', 'typescript', 'ecmascript-runtime-client']);
  api.mainModule('logging.js');
  api.addFiles('logging_server.js', 'server');
  api.addFiles('logging_browser.js', 'client');
  api.mainModule('logging_cordova.js', 'web.cordova');
  api.addAssets('logging.d.ts', 'server');
});

Package.onTest(function (api) {
  api.use(['tinytest', 'ejson', 'ecmascript']);
  api.use('logging', ['client', 'server']);
  api.mainModule('logging_test.js', ['server', 'client']);
});
