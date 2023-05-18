Package.describe({
  name: 'hot-module-replacement',
  version: '1.0.0-alpha300.8',
  summary: 'Update code in development without reloading the page',
  documentation: 'README.md',
  debugOnly: true,
});

Package.onUse(function(api) {
  api.use('modules');
  api.use('meteor');
  api.use('hot-code-push', { unordered: true });

  api.addAssets('hot-module-replacement.d.ts', 'server');

  // Provides polyfills needed by Meteor.absoluteUrl in legacy browsers
  api.use('ecmascript-runtime-client', { weak: true });

  api.imply('modules-runtime-hot@1.0.0-alpha300.5');
  api.addFiles(['./hot-api.js', './client.js'], 'client');
  api.addFiles('./server.js', 'server');
});

Package.onTest(function(api) {});
