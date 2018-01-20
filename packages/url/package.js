Package.describe({
  summary: "Utility code for constructing URLs",
  version: "1.2.0"
});

Package.onUse(function(api) {
  api.use('modules');
  api.mainModule('url_client.js', 'client');
  api.mainModule('url_server.js', 'server');
  api.export('URL');
});

Package.onTest(function (api) {
  api.use(['tinytest', 'url']);
  api.addFiles('url_tests.js');
});

// More tests can be found in the http package
