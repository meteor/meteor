Package.describe({
  summary: "Reload the page while preserving application state.",
  version: '1.0.1-rc0'
});

Package.on_use(function (api) {
  api.use(['underscore', 'logging', 'json'], 'client');
  api.export('Reload', 'client');
  api.add_files('reload.js', 'client');
  api.add_files('deprecated.js', 'client');
});
