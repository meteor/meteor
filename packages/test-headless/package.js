Package.describe({
  name: 'test-headless',
  summary: 'Run package tests headlessly and print results to the terminal.',
  version: '1.0.0',
  testOnly: true,
});

Package.onUse(function (api) {
  api.use(['tinytest', 'ejson'], 'server');
  api.addFiles(['server.js'], 'server');
});
