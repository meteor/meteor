Package.describe({
  summary: "Weibo OAuth flow",
  // internal for now. Should be external when it has a richer API to do
  // actual API things with the service, not just handle the OAuth flow.
  internal: true
});

Package.on_use(function(api) {
  api.use('oauth2', ['client', 'server']);
  api.use('http', ['client', 'server']);
  api.use('templating', 'client');

  api.add_files(
    ['weibo_configure.html', 'weibo_configure.js'],
    'client');

  api.add_files('weibo_common.js', ['client', 'server']);
  api.add_files('weibo_server.js', 'server');
  api.add_files('weibo_client.js', 'client');
});
