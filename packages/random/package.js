Package.describe({
  summary: 'Random number generator and utilities',
  version: '2.0.0-alpha300.6',
});

Package.onUse(function (api) {
  api.use('ecmascript');
  api.export('Random');
  api.mainModule('main_client.js', 'client');
  api.mainModule('main_server.js', 'server');
  api.addAssets('random.d.ts', 'server');
});

Package.onTest(function (api) {
  api.use('random');
  api.use('ecmascript');
  api.use('tinytest');
  api.mainModule('random_tests.js');
});
