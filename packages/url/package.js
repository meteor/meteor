Package.describe({
  summary: "Utility code for constructing URLs",
  version: "1.0.10",
  git: 'https://github.com/meteor/meteor/tree/master/packages/url'
});

Package.onUse(function(api) {
  api.export('URL');
  api.use('underscore', ['client', 'server']);
  api.addFiles('url_common.js', ['client', 'server']);
  api.addFiles('url_client.js', 'client');
  api.addFiles('url_server.js', 'server');
});

// tests are in the http package
