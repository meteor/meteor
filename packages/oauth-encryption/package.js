Package.describe({
  summary: "Encrypt account secrets stored in the database",
  version: '1.3.3-alpha300.20',
});

Package.onUse(api => {
  api.use('ecmascript', 'server');
  api.use("modules@0.19.1-alpha300.20", "server");
  api.use("ejson@1.1.3", "server");
  api.mainModule("encrypt.js", "server");
  api.export("OAuthEncryption", "server");
});

Package.onTest(api => {
  api.use("tinytest");
  api.use("oauth-encryption");
  api.addFiles("encrypt_tests.js", ["server"]);
});
