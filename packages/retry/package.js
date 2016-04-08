Package.describe({
  summary: "Retry logic with exponential backoff",
  version: '1.0.7-rc.0'
});

Package.onUse(function (api) {
  api.use(['underscore', 'random'], ['client', 'server']);
  api.export('Retry');
  api.addFiles('retry.js', ['client', 'server']);
});
