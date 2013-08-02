Package.describe({
  summary: "Github OAuth flow",
  // internal for now. Should be external when it has a richer API to do
  // actual API things with the service, not just handle the OAuth flow.
  internal: true
});

Package.on_use(function(api) {
  api.use('oauth2', ['client', 'server']);
  api.use('oauth', ['client', 'server']);
  api.use('http', ['server']);
  api.use('underscore', 'client');
  api.use('templating', 'client');
  api.use('random', 'client');
  api.use('service-configuration', ['client', 'server']);

  api.export('Github');

  api.add_files(
    ['github_configure.html', 'github_configure.js'],
    'client');

  api.add_files('github_server.js', 'server');
  api.add_files('github_client.js', 'client');
});
