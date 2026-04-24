Package.describe({
  summary: 'Run tests noninteractively, with results going to the console.',
  version: '2.0.1',
});

Package.onUse(function(api) {
  api.use(['tinytest', 'random', 'ejson', 'check', 'ecmascript']);
  api.use('fetch', 'server');

  // Many packages' onTest dependencies pull in test-helpers, which pulls
  // in blaze, whose DOM backend throws "jQuery not found" unless jquery
  // is present in the client bundle. blaze declares jquery as a weak
  // dep, so we have to wire it here for test runs to boot at all.
  api.use('jquery', 'client');

  api.export('TEST_STATUS', 'client');

  api.addFiles(['driver.js', 'test.css'], 'client');

  api.addFiles(['reporter.js'], 'server');

  api.addAssets('puppeteer_runner.js', 'server');

  api.export('runTests');
});
