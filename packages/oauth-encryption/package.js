// Uses the node-aes-gcm NPM module from the dev bundle (because
// binary modules aren't working yet).

Package.describe({
  summary: "Encrypt account secrets stored in the database"
});

Package.on_use(function (api) {
  api.export("OAuthEncryption", ["server"]);
  api.use("underscore");
  api.add_files("encrypt.js", ["server"]);
});

Package.on_test(function (api) {
  api.use("tinytest");
  api.use("oauth-encryption");
  api.add_files("encrypt_tests.js", ["server"]);
});
