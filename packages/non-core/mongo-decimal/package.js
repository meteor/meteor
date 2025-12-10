Package.describe({
  summary: "JS simulation of MongoDB Decimal128 type",
  version: '0.2.0',
});

Npm.depends({
  "decimal.js": "10.3.1"
});

Package.onUse(function (api) {
  api.use('ecmascript@0.16.9');
  api.use('ejson@1.1.4');
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
