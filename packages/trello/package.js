Package.describe({
  summary: "Trello OAuth flow",
  // internal for now. Should be external when it has a richer API to do
  // actual API things with the service, not just handle the OAuth flow.
  internal: true
});

Package.on_use(function(api) {
  api.use('http', ['client', 'server']);
  api.use('templating', 'client');
  api.use('service-configuration', ['client', 'server']);
  api.use('oauth1', ['client', 'server']);

  api.add_files(
    ['trello_configure.html', 'trello_configure.js'],
    'client');

  api.add_files('trello_common.js', ['client', 'server']);
  api.add_files('trello_server.js', 'server');
  api.add_files('trello_client.js', 'client');
});