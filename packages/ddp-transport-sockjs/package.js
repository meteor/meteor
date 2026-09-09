Package.describe({
  name: 'ddp-transport-sockjs',
  version: '1.0.0',
  summary: 'Internal SockJS transport provider for DDP',
  documentation: null,
});

Npm.depends({
  sockjs: '0.3.24',
});

Package.onUse(function (api) {
  api.use(['ecmascript', 'ddp-transport-registry'], ['client', 'server']);
  api.use(['webapp', 'routepolicy'], 'server');
  api.mainModule('client/main.js', 'client');
  api.mainModule('server/main.js', 'server');
});

Package.onTest(function (api) {
  api.use([
    'ecmascript',
    'tinytest',
    'ddp-transport-registry',
    'ddp-transport-sockjs',
  ], ['client', 'server']);
  api.use(['webapp', 'routepolicy'], 'server');
  api.mainModule('server/transport_tests.js', 'server');
});
