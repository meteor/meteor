Package.describe({
  summary: 'Run tests noninteractively, with results going to the console.',
  version: '1.2.6',
});

Package.onUse(function(api) {
  api.use(['tinytest', 'random', 'ejson', 'check', 'jquery']);
  api.use('fetch', 'server');

  api.export('TEST_STATUS', 'client');

  api.addFiles(['driver.js', 'test.css'], 'client');

  api.addFiles(['reporter.js'], 'server');

  // This is to be run by phantomjs, not as part of normal package code.
  api.addAssets('phantomRunner.js', 'server');
  api.addAssets('puppeteerRunner.js', 'server');

  api.export('runTests');
});
