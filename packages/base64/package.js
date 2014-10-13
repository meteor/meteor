Package.describe({
  summary: "Base64 encoding and decoding",
  version: '1.0.1'
});

Package.on_use(function (api) {
  api.export('Base64');
  api.add_files('base64.js', ['client', 'server']);
});

Package.on_test(function (api) {
  api.use('base64', ['client', 'server']);
  api.use(['tinytest', 'underscore', 'ejson']);

  api.add_files('base64_test.js', ['client', 'server']);
});
