Package.describe({
  summary: "JS simulation of MongoDB Decimal128 type",
  version: '0.0.1'
});

Npm.depends({
  "decimal.js": "9.0.1"
});

Package.onUse(function (api) {
  api.use('ecmascript');
  api.use('ejson');
  api.mainModule('decimal.js');
  api.export('Decimal');
});
