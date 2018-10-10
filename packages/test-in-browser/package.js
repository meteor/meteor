Package.describe({
  summary: "Run tests interactively in the browser",
  version: '1.2.0',
  documentation: null
});

Package.onUse(function (api) {
  api.use('ecmascript');
  // XXX this should go away, and there should be a clean interface
  // that tinytest and the driver both implement?
  api.use('tinytest');
  api.use('bootstrap@1.0.1');
  api.use('underscore');

  api.use('session');
  api.use('reload');
  api.use('jquery@1.11.1');

  api.use(['webapp', 'blaze@2.1.8', 'templating@1.2.13', 'spacebars@1.0.12',
           'ddp', 'tracker'], 'client');

  api.addFiles('diff_match_patch_uncompressed.js', 'client');

  api.addFiles([
    'driver.html',
    'driver.js',
    'driver.css'
  ], "client");

  api.use("random", "server");
  api.mainModule("server.js", "server");

  api.export('runTests');
});
