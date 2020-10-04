Package.describe({
  name: 'debug-only',
  debugOnly: true
});

Package.onUse(function(api) {
  api.addFiles('debug-only.js');
  api.export('Debug');
});
