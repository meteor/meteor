Package.describe({
  summary: "Utility code for constructing URLs",
  version: "1.0.5-plugins.0"
});

Package.onUse(function(api) {
  api.export('URL');
  api.use('underscore', ['client', 'server']);
  api.addFiles('url_common.js', ['client', 'server']);
  api.addFiles('url_client.js', 'client');
  api.addFiles('url_server.js', 'server');
});

// tests are in the http package
