Package.describe({
  name: "sha",
  test: "sha-test",
  summary: "SHA256 implementation",
  version: "1.0.0",
  internal: true
});

Package.on_use(function (api) {
  api.export('SHA256');
  api.add_files(['sha256.js'], ['client', 'server']);
});
