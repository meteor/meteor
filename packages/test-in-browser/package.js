Package.describe({
  summary: "Run tests interactively in the browser",
  version: '1.6.1-rc360.0',
  documentation: null
});

Npm.depends({
  'bootstrap': '4.3.1',
  'diff': '8.0.2'
});

Package.onUse(function (api) {
  api.use('ecmascript');
  // XXX this should go away, and there should be a clean interface
  // that tinytest and the driver both implement?
  api.use('tinytest');

  api.use('session');
  api.use('reload');

  api.use([
    'webapp',
    'blaze@3.0.3',
    'templating@1.4.5',
    'spacebars@2.0.1',
    'jquery@3.0.0',
    'ddp',
    'tracker',
  ], 'client');

  api.addFiles([
    'driver.html',
    'driver.js',
    'driver.css',
  ], "client");

  api.use("random", "server");
  api.mainModule("server.js", "server");

  api.export('runTests');
});
