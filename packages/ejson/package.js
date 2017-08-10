Package.describe({
  summary: 'Extended and Extensible JSON library',
  version: '1.0.14-beta152.9'
});

Package.onUse(function onUse(api) {
  api.use(['ecmascript', 'base64']);
  api.mainModule('ejson.js');
  api.export('EJSON');
});

Package.onTest(function onTest(api) {
  api.use(['ecmascript', 'tinytest']);
  api.use('ejson');
  api.mainModule('ejson_tests.js');
});
