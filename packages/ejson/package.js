Package.describe({
  summary: 'Extended and Extensible JSON library',
  version: '1.3.0',
});

Package.onUse(function onUse(api) {
  api.use('meteor@2.1.1');
  api.use(['ecmascript@0.16.13', 'base64@1.0.13']);
  api.addAssets('ejson.d.ts', 'server');
  api.mainModule('ejson.js');
  api.export('EJSON');
});

Package.onTest(function onTest(api) {
  api.use(['ecmascript', 'tinytest', 'mongo']);
  api.use('ejson');
  api.mainModule('ejson_tests.js');
});
