Package.describe({
  summary: "Run tests interactively in the browser",
  version: '1.3.0',
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
  api.use('underscore');

  api.use('session');
  api.use('reload');

  api.use([
    'webapp',
    'blaze@2.3.4',
    'templating@1.3.2',
    'spacebars@1.0.15',
    'jquery@3.0.0',
    'ddp',
    'tracker',
  ], 'client');

  api.addFiles('diff_match_patch_uncompressed.js', 'client');

  api.addFiles([
    'driver.html',
    'driver.js',
    'driver.css',
  ], "client");

  api.use("random", "server");
  api.mainModule("server.js", "server");

  api.export('runTests');
});
