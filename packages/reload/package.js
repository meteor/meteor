Package.describe({
  summary: "Reload the page while preserving application state.",
  internal: true
});

Package.on_use(function (api) {
  api.use(['underscore', 'logging', 'json'], 'client');
  api.export('Reload', 'client');
  api.add_files('reload.js', 'client');
  api.add_files('deprecated.js', 'client');
});
