Package.describe({
  summary: "Retry logic with exponential backoff",
  version: '1.0.8',
  git: 'https://github.com/meteor/meteor/tree/master/packages/retry'
});

Package.onUse(function (api) {
  api.use(['underscore', 'random'], ['client', 'server']);
  api.export('Retry');
  api.addFiles('retry.js', ['client', 'server']);
});
