Package.describe({
  summary: "Run tests noninteractively, with results going to the console.",
  internal: true
});

Package.on_use(function (api) {

  api.use('tinytest');
  api.use('http');

  api.add_files([
    'driver.js'
  ], "client");
  api.add_files([
    'reporter.js'
  ], "server");
});
