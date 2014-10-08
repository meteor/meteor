Package.describe({
  name: 'debug-only',
  debugOnly: true
});

Package.onUse(function(api) {
//  api.versionsFrom('0.9.3.1');
  api.addFiles('debug-only.js');
});

Package.onTest(function(api) {
  api.use('tinytest');
  api.use('debug-only');
  api.addFiles('debug-only-tests.js');
});
