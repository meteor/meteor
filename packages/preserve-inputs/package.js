Package.describe({
  summary: "Deprecated package (now empty)",
  version: "1.0.2-ipc.0"
});

Package.on_use(function (api) {
  api.add_files('deprecated.js', 'server');
});
