Package.describe({
  summary: "Run tests interactively in the browser",
  version: '1.0.8',
  documentation: null
});

Package.onUse(function (api) {
  // XXX this should go away, and there should be a clean interface
  // that tinytest and the driver both implement?
  api.use('tinytest');
  api.use('bootstrap@1.0.1');
  api.use('underscore');

  api.use('session');
  api.use('reload');

  api.use(['webapp', 'blaze', 'templating', 'spacebars',
           'ddp', 'tracker'], 'client');

  api.addFiles('diff_match_patch_uncompressed.js', 'client');

  api.addFiles([
    'driver.css',
    'driver.html',
    'driver.js'
  ], "client");

  api.use('autoupdate', 'server', {weak: true});
  api.use('random', 'server');
  api.addFiles('autoupdate.js', 'server');
});
