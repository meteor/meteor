Package.describe({
  summary: "Register callbacks on a hook",
  version: '1.0.4'
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
