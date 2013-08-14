Package.describe({
  summary: "Facebook OAuth flow",
  // internal for now. Should be external when it has a richer API to do
  // actual API things with the service, not just handle the OAuth flow.
  internal: true
});

Package.on_use(function(api) {
  api.use('oauth2', ['client', 'server']);
  api.use('oauth', ['client', 'server']);
  api.use('http', ['server']);
  api.use('templating', 'client');
  api.use('underscore', 'server');
  api.use('random', 'client');
  api.use('service-configuration', ['client', 'server']);

  api.export('Facebook');

  api.add_files(
    ['facebook_configure.html', 'facebook_configure.js'],
    'client');

  api.add_files('facebook_server.js', 'server');
  api.add_files('facebook_client.js', 'client');
});
