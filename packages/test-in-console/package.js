Package.describe({
  summary: 'Run tests noninteractively, with results going to the console.',
  version: '2.0.0',
});

Package.onUse(function(api) {
  api.use(['tinytest', 'random', 'ejson', 'check', 'ecmascript']);
  api.use('fetch', 'server');

  api.export('TEST_STATUS', 'client');

  api.addFiles(['driver.js', 'test.css'], 'client');

  api.addFiles(['reporter.js'], 'server');

  api.addAssets('puppeteer_runner.js', 'server');

  api.export('runTests');
});
