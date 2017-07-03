Package.describe({
  summary: "Extended and Extensible JSON library",
  version: '1.0.14'
});

Package.onUse(function (api) {
  api.use(['ecmascript', 'underscore', 'base64']);
  api.mainModule('ejson.js');
  api.export('EJSON');
});

Package.onTest(function (api) {
  api.use('ejson');
  api.use(['ecmascript', 'tinytest', 'underscore']);
  api.mainModule('ejson_tests.js');
});
