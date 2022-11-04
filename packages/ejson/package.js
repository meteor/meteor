Package.describe({
  summary: 'Extended and Extensible JSON library',
  version: '1.1.2'
});

Package.onUse(function onUse(api) {
  api.use(['ecmascript', 'base64']);
  api.addAssets('ejson.d.ts', 'server');
  api.mainModule('ejson.js');
  api.export('EJSON');
});

Package.onTest(function onTest(api) {
  api.use(['ecmascript', 'tinytest']);
  if (!process.env.DISABLE_FIBERS) {
    api.use('mongo');
  } else {
    api.use('mongo-async');
  }
  api.use('ejson');
  api.mainModule('ejson_tests.js');
});
