Package.describe({
  summary: "Run tests noninteractively in PhantomJS",
  internal: true
});

Package.on_use(function (api) {

  // XXX this should go away, and there should be a clean interface
  // that tinytest and the driver both implement?
  api.use('tinytest');

  api.add_files([
    'driver.js'
  ], "client");
});
