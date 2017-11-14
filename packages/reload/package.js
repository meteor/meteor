Package.describe({
  summary: "Reload the page while preserving application state.",
  version: '1.1.11'
});

Package.onUse(function (api) {
  api.use('ecmascript');
  api.mainModule('reload.js', 'client');
  api.export('Reload', 'client');
});

Package.onTest(function (api) {
  api.use(['tinytest', 'reload'], 'client');
  api.addFiles('reload_tests.js', 'client');
});
