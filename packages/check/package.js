Package.describe({
  summary: "Check whether a value matches a pattern",
  version: '1.1.1-modules.6'
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
