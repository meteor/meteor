Package.describe({
  summary: "JS simulation of MongoDB Decimal128 type",
  version: '0.1.1'
});

Npm.depends({
  "decimal.js": "10.0.2"
});

Package.onUse(function (api) {
  api.use('ecmascript');
  api.use('ejson');
  api.mainModule('decimal.js');
  api.export('Decimal');
});

Package.onTest(function (api) {
  api.use('mongo');
  api.use('mongo-decimal');
  api.use('insecure');
  api.use(['tinytest']);
  api.addFiles('decimal_tests.js', ['client', 'server']);
});
