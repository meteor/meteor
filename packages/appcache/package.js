Package.describe({
  summary: "Enable the application cache in the browser",
  version: "1.0.2-pre.2"
});

Package.onUse(function (api) {
  api.use('webapp', 'server');
  api.use('reload', 'client');
  api.use('routepolicy', 'server');
  api.use('underscore', 'server');
  api.use('autoupdate', 'server', {weak: true});
  api.addFiles('appcache-client.js', 'client');
  api.addFiles('appcache-server.js', 'server');
});

Package.onTest(function (api) {
  api.use('tinytest');
  api.use('appcache');
  api.use('underscore', 'client');
  api.use('http', 'client');
  api.addFiles('appcache_tests.js', 'client');
});
