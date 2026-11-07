Package.describe({
  version: '0.1.3',
  summary: 'Show build errors in client when using HMR',
  documentation: 'README.md',
  devOnly: true
});

Package.onUse(function (api) {
  api.use([
    'ecmascript'
  ]);
  api.export('DevErrorOverlay', 'client');
  api.addFiles('client.js', 'modern');
});

Package.onTest(function (api) {
  api.use(['ecmascript', 'tinytest', 'dev-error-overlay']);
  api.addFiles('dev-error-overlay-tests.js', 'client');
});
