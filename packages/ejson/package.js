Package.describe({
  summary: 'Extended and Extensible JSON library',
  version: '1.1.1',
});

Npm.depends({
  '@trusktr/meteor-base64': '1.0.12',
});

Package.onUse(function onUse(api) {
  api.use(['ecmascript']);
  api.mainModule('ejson.js');
  api.export('EJSON');
});

Package.onTest(function onTest(api) {
  api.use(['ecmascript', 'tinytest', 'mongo']);
  api.use('ejson');
  api.mainModule('ejson_tests.js');
});
