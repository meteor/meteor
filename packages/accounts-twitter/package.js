Package.describe({
  summary: "Login service for Twitter accounts"
});

Package.on_use(function(api) {
  api.use('accounts-base', ['client', 'server']);
  api.use('accounts-oauth1-helper', ['client', 'server']);
  api.use('http', ['client', 'server']);
  api.use('templating', 'client');

  api.add_files(
    ['twitter_configure.html', 'twitter_configure.js'],
    'client');

  api.add_files('twitter_common.js', ['client', 'server']);
  api.add_files('twitter_server.js', 'server');
  api.add_files('twitter_client.js', 'client');
});
