Package.describe({
  summary: "Twitter OAuth flow",
  version: '1.1.0'
});

Package.on_use(function(api) {
  api.use('http', ['client', 'server']);
  api.use('templating', 'client');
  api.use('oauth1', ['client', 'server']);
  api.use('oauth', ['client', 'server']);
  api.use('random', 'client');
  api.use('underscore', 'server');
  api.use('service-configuration', ['client', 'server']);

  api.export('Twitter');

  api.add_files(
    ['twitter_configure.html', 'twitter_configure.js'],
    'client');

  api.add_files('twitter_server.js', 'server');
  api.add_files('twitter_client.js', 'client');
});
