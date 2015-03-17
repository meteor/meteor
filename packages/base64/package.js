Package.describe({
  summary: "Base64 encoding and decoding",
  version: '1.0.3'
});

Package.onUse(function (api) {
  api.export('Base64');
  api.addFiles('base64.js', ['client', 'server']);
});

Package.onTest(function (api) {
  api.use('base64', ['client', 'server']);
  api.use(['tinytest', 'underscore', 'ejson']);

  api.addFiles('base64_test.js', ['client', 'server']);
});
