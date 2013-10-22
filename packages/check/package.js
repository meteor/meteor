Package.describe({
  summary: "Check whether a value matches a pattern",
  internal: true
});

Package.on_use(function (api) {
  api.use(['underscore', 'ejson'], ['client', 'server']);

  api.export(['check', 'Match']);

  api.add_files('match.js', ['client', 'server']);
});

Package.on_test(function (api) {
  api.use(['check', 'tinytest', 'underscore', 'ejson'], ['client', 'server']);

  api.add_files('match_test.js', ['client', 'server']);
});
