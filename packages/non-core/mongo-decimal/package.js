Package.describe({
  summary: "JS simulation of MongoDB Decimal128 type",
  version: '1.0.0-alpha300.5',
});

Npm.depends({
  "decimal.js": "10.3.1"
});

Package.onUse(function (api) {
  api.use('ecmascript@1.0.0-alpha300.5');
  api.use('ejson@2.0.0-alpha300.5');
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
