Package.describe({
  summary: "Run tests interactively in the browser",
  internal: true
});

Package.on_use(function (api) {

  // XXX this should go away, and there should be a clean interface
  // that tinytest and the driver both implement?
  api.use('tinytest');
  api.use('bootstrap');
  api.use('underscore');

  api.use('session');

  api.use(['spark', 'livedata', 'templating', 'deps'], 'client');

  api.add_files([
    'driver.css',
    'driver.html',
    'driver.js'
  ], "client");
});
