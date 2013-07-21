Package.describe({
  summary: "LinkedIn OAuth flow",
  // internal for now. Should be external when it has a richer API to do
  // actual API things with the service, not just handle the OAuth flow.
  internal: true
});

Package.on_use(function(api) {
  api.use('oauth2', ['client', 'server']);
  api.use('oauth', ['client', 'server']);
  api.use('http', ['client', 'server']);
  api.use('underscore', 'client');
  api.use('templating', 'client');
  api.use('random', 'client');
  api.use('service-configuration', ['client', 'server']);

  api.add_files(
    ['linkedin_configure.html', 'linkedin_configure.js'],
    'client');

  api.add_files('linkedin_common.js', ['client', 'server']);
  api.add_files('linkedin_server.js', 'server');
  api.add_files('linkedin_client.js', 'client');
});
