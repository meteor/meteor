Package.describe({
  summary: "Run tests noninteractively, with results going to the console.",
  internal: true
});

Package.on_use(function (api) {

  api.use(['tinytest', 'underscore', 'random', 'ejson', 'check']);
  api.use('http', 'server');

  api.export('TEST_STATUS', 'client');

  api.add_files(['driver.js'], "client");
  api.add_files(['reporter.js'], "server");

  // This is to be run by phantomjs, not as part of normal package code.
  api.add_files('runner.js', 'server', {isAsset: true});
});
