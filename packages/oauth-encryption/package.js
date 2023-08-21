Package.describe({
  summary: "Encrypt account secrets stored in the database",
  version: '2.0.0-alpha300.11',
});

Package.onUse(api => {
  api.use('ecmascript', 'server');
  api.use("modules@1.0.0-alpha300.5", "server");
  api.use("ejson@2.0.0-alpha300.5", "server");
  api.mainModule("encrypt.js", "server");
  api.export("OAuthEncryption", "server");
});

Package.onTest(api => {
  api.use("tinytest");
  api.use("oauth-encryption");
  api.addFiles("encrypt_tests.js", ["server"]);
});
