Package.describe({
  name: 'ddp-transport-uws',
  version: '1.0.0',
  summary: 'Internal uWebSockets.js transport provider for DDP',
  documentation: null,
});

Npm.depends({
  'uWebSockets.js':
    'git+https://github.com/unetworking/uWebSockets.js#v20.66.0',
});

Package.onUse(function (api) {
  api.use(['ecmascript', 'ddp-transport-registry'], 'server');
  api.use('webapp', 'server');
  api.mainModule('server/main.js', 'server');
});

Package.onTest(function (api) {
  api.use([
    'ecmascript',
    'tinytest',
    'ddp-transport-registry',
    'ddp-transport-uws',
    'webapp',
  ], 'server');
  api.mainModule('server/transport_tests.js', 'server');
});
