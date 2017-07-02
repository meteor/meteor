Package.describe({
  name: 'debug-only',
  debugOnly: true
});

Package.onUse(function (api) {
  api.mainModule('debug-only.js');
  api.export('DebugOnly');
});
