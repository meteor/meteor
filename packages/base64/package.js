Package.describe({
  summary: "Base64 encoding and decoding",
  version: '1.0.13',
});

Package.onUse(api => {
  api.export('Base64');
  api.use('ecmascript');
  api.mainModule('base64.js');
});

Package.onTest(api => {
  api.use(['ecmascript', 'tinytest', 'harry97:cbor@1.2.1']);
  api.addFiles('base64_test.js', ['client', 'server']);
});
