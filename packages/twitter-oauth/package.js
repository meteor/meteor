Package.describe({
  summary: "Twitter OAuth flow",
  version: '1.3.4-beta300.4'
});

Package.onUse(function(api) {
  api.use('oauth1', ['client', 'server']);
  api.use('oauth', ['client', 'server']);
  api.use('random', 'client');
  api.use('service-configuration', ['client', 'server']);

  api.addFiles('twitter_common.js', ['server', 'client']);

  api.addFiles('twitter_client.js', 'client');
  api.addFiles('twitter_server.js', 'server');

  api.export('Twitter');
});
