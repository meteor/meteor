Package.describe({
  summary: "Register callbacks on a hook",
  version: '1.0.9',
  git: 'https://github.com/meteor/meteor/tree/master/packages/callback-hook'
});

Package.onUse(function (api) {
  api.use('underscore', ['client', 'server']);

  api.export('Hook');

  api.addFiles('hook.js', ['client', 'server']);
});

Package.onTest(function (api) {
  api.use('callback-hook');
  api.use('tinytest');
  api.addFiles('hook_tests.js', 'server');
});
