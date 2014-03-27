Package.describe({
  summary: "Deprecated package (now empty)",
  internal: true
});

Package.on_use(function (api) {
  api.add_files('deprecated.js', 'server');
});
