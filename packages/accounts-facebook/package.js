Package.describe({
  summary: "Integration with facebook accounts",
});

Package.on_use(function(api) {
  api.use('accounts', ['client', 'server']);
  api.use('oauth2', ['client', 'server']);
  api.use('http', ['client', 'server']);

  api.add_files('facebook_common.js', ['client', 'server']);
  api.add_files('facebook_server.js', 'server');
  api.add_files('facebook_client.js', 'client');
});
