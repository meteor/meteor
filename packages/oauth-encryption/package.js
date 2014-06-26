Package.describe({
  name: "oauth-encryption",
  test: "oauth-encryption-test",
  summary: "Encrypt account secrets stored in the database",
  version: '1.0.0'
});

Package.on_use(function (api) {
  api.use('npm-node-aes-gcm@=0.1.3');
  api.export("OAuthEncryption", ["server"]);
  api.use("underscore");
  api.add_files("encrypt.js", ["server"]);
});

Package.on_test(function (api) {
  api.use("tinytest");
  api.use("oauth-encryption");
  api.add_files("encrypt_tests.js", ["server"]);
});
