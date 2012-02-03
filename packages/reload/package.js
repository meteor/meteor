Package.describe({
  summary: "Reload the page while preserving application state.",
  internal: true
});

Package.on_use(function (api) {
  api.use(['underscore', 'logging', 'json'], 'client');
  api.add_files('reload.js', 'client');
});
