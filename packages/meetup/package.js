Package.describe({
  summary: "Meetup OAuth flow",
  // internal for now. Should be external when it has a richer API to do
  // actual API things with the service, not just handle the OAuth flow.
  internal: true
});

Package.on_use(function(api) {
  api.use('oauth2', ['client', 'server']);
  api.use('http', ['client', 'server']);
  api.use('templating', 'client');

  api.add_files(
    ['meetup_configure.html', 'meetup_configure.js'],
    'client');

  api.add_files('meetup_common.js', ['client', 'server']);
  api.add_files('meetup_server.js', 'server');
  api.add_files('meetup_client.js', 'client');
});
