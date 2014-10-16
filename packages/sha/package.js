Package.describe({
  summary: "SHA256 implementation",
  version: "1.0.1"
});

Package.on_use(function (api) {
  api.export('SHA256');
  api.add_files(['sha256.js'], ['client', 'server']);
});
