Package.describe({
  name: 'offline',
  version: '0.0.1',
  summary: 'Keep published documents and queued Method calls on the device across reloads and offline periods',
  documentation: 'README.md',
});

Package.onUse(function (api) {
  api.use(['ecmascript', 'ejson', 'random', 'tracker', 'ddp-client'], 'client');
  // Loads before this package when present, so the stored user id is already
  // restored when the app calls Offline.start().
  api.use('accounts-base', 'client', { weak: true });
  api.mainModule('offline.js', 'client');
  api.export('Offline', 'client');
  api.types('offline.d.ts');
});

Package.onTest(function (api) {
  api.use(['ecmascript', 'tinytest', 'ejson', 'random', 'mongo', 'ddp-client', 'tracker', 'accounts-password']);
  api.use('offline', 'client');
  api.addFiles('offline_tests_common.js');
  api.mainModule('offline_tests.js', 'client');
});
