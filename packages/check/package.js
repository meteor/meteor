Package.describe({
  summary: "Check whether a value matches a pattern",
  version: '1.0.5'
});

Package.onUse(function (api) {
  api.use(['underscore', 'ejson'], ['client', 'server']);

  api.export(['check', 'Match']);

  api.addFiles('match.js', ['client', 'server']);
});

Package.onTest(function (api) {
  api.use(['check', 'tinytest', 'underscore', 'ejson'], ['client', 'server']);

  api.addFiles('match_test.js', ['client', 'server']);
});
