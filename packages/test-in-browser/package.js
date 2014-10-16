Package.describe({
  summary: "Run tests interactively in the browser",
  version: '1.0.5'
});

Package.on_use(function (api) {
  // XXX this should go away, and there should be a clean interface
  // that tinytest and the driver both implement?
  api.use('tinytest');
  api.use('bootstrap@1.0.1');
  api.use('underscore');

  api.use('session');
  api.use('reload');

  api.use(['blaze', 'templating', 'spacebars',
           'ddp', 'tracker'], 'client');

  api.add_files('diff_match_patch_uncompressed.js', 'client');

  api.add_files('diff_match_patch_uncompressed.js', 'client');

  api.add_files([
    'driver.css',
    'driver.html',
    'driver.js'
  ], "client");

  api.use('autoupdate', 'server', {weak: true});
  api.use('random', 'server');
  api.add_files('autoupdate.js', 'server');
});
