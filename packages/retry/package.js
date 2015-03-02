Package.describe({
  summary: "Retry logic with exponential backoff",
  version: '1.0.3-eachin.43'
});

Package.onUse(function (api) {
  api.use(['underscore', 'random'], ['client', 'server']);
  api.export('Retry');
  api.addFiles('retry.js', ['client', 'server']);
});
