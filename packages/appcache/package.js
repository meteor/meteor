Package.describe({
  summary: "Enable the application cache in the browser",
  version: "1.1.2",
});

Package.onUse(api => {
  api.use('ecmascript', ['client', 'server']);
  api.use(['webapp', 'routepolicy'], 'server');
  api.use('reload', 'client');
  api.use('autoupdate', 'server', {weak: true});
  api.mainModule('appcache-client.js', 'client');
  api.mainModule('appcache-server.js', 'server');
});

Package.onTest(api => {
  api.use('tinytest');
  api.use('appcache');
  api.use('http', 'client');
  api.use('webapp', 'server');
  api.addFiles('appcache_tests-server.js', 'server');
  api.addFiles('appcache_tests-client.js', 'client');
});
