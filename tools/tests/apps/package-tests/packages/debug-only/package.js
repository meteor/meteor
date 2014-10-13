Package.describe({
  name: 'debug-only',
  debugOnly: true
});

Package.onUse(function(api) {
//  api.versionsFrom('0.9.3.1');
  api.addFiles('debug-only.js');
  api.export('Debug');
});
