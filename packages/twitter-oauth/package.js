Package.describe({
  summary: "Twitter OAuth flow",
  version: "1.3.0"
});

Package.onUse(function(api) {
  api.use('oauth1', ['client', 'server']);
  api.use('oauth', ['client', 'server']);
  api.use('random', 'client');
  api.use('underscore', 'server');
  api.use('service-configuration', ['client', 'server']);

  api.addFiles('twitter_common.js', ['server', 'client']);

  api.addFiles('twitter_client.js', 'client');
  api.addFiles('twitter_server.js', 'server');

  api.export('Twitter');
});
