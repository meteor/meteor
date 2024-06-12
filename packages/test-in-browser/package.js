Package.describe({
  summary: "Run tests interactively in the browser",
  version: '1.4.0-rc300.4',
  documentation: null
});

Npm.depends({
  'bootstrap': '4.3.1',
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
    'blaze',
    'templating',
    'spacebars',
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
