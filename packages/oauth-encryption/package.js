Package.describe({
  summary: "Encrypt account secrets stored in the database",
  version: '1.0.6'
});

Package.onUse(function (api) {
  api.use("npm-node-aes-gcm@=0.1.3_6");

  api.export("OAuthEncryption", ["server"]);
  api.use([
    "underscore",
    "ejson"
  ]);
  api.addFiles("encrypt.js", ["server"]);
});

Package.onTest(function (api) {
  api.use("tinytest");
  api.use("oauth-encryption");
  api.addFiles("encrypt_tests.js", ["server"]);
});
