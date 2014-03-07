Package.describe({
  summary: "Retry logic with exponential backoff",
  internal: true
});

Package.on_use(function (api) {
  api.use(['underscore', 'random'], ['client', 'server']);
  api.export('Retry');
  api.add_files('retry.js', ['client', 'server']);
});
