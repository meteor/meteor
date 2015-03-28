Package.describe({
  summary: "SHA256 implementation",
  version: "1.0.3"
});

Package.onUse(function (api) {
  api.export('SHA256');
  api.addFiles(['sha256.js'], ['client', 'server']);
});
