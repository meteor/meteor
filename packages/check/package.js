Package.describe({
  summary: "Check whether a value matches a pattern",
  version: '1.1.2-rc.10'
});

Package.onUse(function (api) {
  api.use(['underscore', 'ejson'], ['client', 'server']);
  api.use('jquery', 'client');

  api.export(['check', 'Match']);

  api.addFiles('jquery.js', 'server');
  api.addFiles('match.js', ['client', 'server']);
});

Package.onTest(function (api) {
  api.use(['check', 'tinytest', 'underscore', 'ejson', 'ecmascript'], ['client', 'server']);

  api.addFiles('match_test.js', ['client', 'server']);
});
