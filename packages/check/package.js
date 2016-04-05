Package.describe({
  summary: "Check whether a value matches a pattern",
  version: '1.1.2'
});

Package.onUse(function (api) {
  api.use(['underscore', 'ejson'], ['client', 'server']);

  api.export(['check', 'Match']);

  api.addFiles('match.js', ['client', 'server']);
});

Npm.depends({
  'lodash.isplainobject': '4.0.4'
});

Package.onTest(function (api) {
  api.use(['check', 'tinytest', 'underscore', 'ejson', 'ecmascript'], ['client', 'server']);

  api.addFiles('match_test.js', ['client', 'server']);
});
