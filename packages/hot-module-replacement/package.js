Package.describe({
  name: 'hot-module-replacement',
  version: '0.2.1',
  summary: 'Update code in development without reloading the page',
  documentation: 'README.md',
  debugOnly: true
});

Package.onUse(function (api) {
  api.versionsFrom('2.2');
  api.use('modules');
  api.use('meteor');
  api.use('hot-code-push', { unordered: true });

  api.use('dev-error-overlay', { weak: true });
  api.imply('modules-runtime-hot@0.13.0');
  api.addFiles([
    './hot-api.js',
    './client.js'
  ], 'client');
  api.addFiles('./server.js', 'server');
});

Package.onTest(function (api) {
});
