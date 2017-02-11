Package.describe({
  summary: "Utility code for constructing URLs",
  version: "1.1.0"
});

Package.onUse(function(api) {
  api.export('URL');
  api.use('underscore', ['client', 'server']);
  api.addFiles('url_common.js', ['client', 'server']);
  api.addFiles('url_client.js', 'client');
  api.addFiles('url_server.js', 'server');
});

Package.onTest(function (api) {
  api.use(['tinytest', 'url']);
  api.addFiles('url_tests.js');
});

// More tests can be found in the http package
