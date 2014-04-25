Package.describe({
  summary: "Deprecated package (now empty)",
  version: "1.0.0",
  internal: true
});

Package.on_use(function (api) {
  api.add_files('deprecated.js', 'server');
});
