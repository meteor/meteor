Package.describe({
  summary: "Check whether a value matches a pattern",
  version: '1.3.0-beta161.18'
});

Package.onUse(function (api) {
  api.use('ecmascript');
  api.use('ejson');

  api.mainModule('match.js');

  api.export('check');
  api.export('Match');
});

Package.onTest(function (api) {
  api.use(['check', 'tinytest', 'underscore', 'ejson', 'ecmascript'], ['client', 'server']);

  api.addFiles('match_test.js', ['client', 'server']);
});
