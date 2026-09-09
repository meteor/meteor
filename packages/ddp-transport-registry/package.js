Package.describe({
  name: 'ddp-transport-registry',
  version: '1.0.0',
  summary: 'Internal registry for DDP transport providers',
  documentation: null,
});

Package.onUse(function (api) {
  api.use('ecmascript', ['client', 'server']);
  api.mainModule('registry.js', ['client', 'server']);
});

Package.onTest(function (api) {
  api.use(['ecmascript', 'tinytest', 'ddp-transport-registry']);
  api.mainModule('registry_tests.js', ['client', 'server']);
});
