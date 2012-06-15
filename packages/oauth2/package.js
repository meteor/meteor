Package.describe({
  summary: "A basis for OAuth2-based account systems",
  internal: true
});

Package.on_use(function (api) {
  api.use('accounts', ['client', 'server']);

  api.add_files('oauth2_common.js', ['client', 'server']);
  api.add_files('oauth2_server.js', 'server');
  api.add_files('oauth2_client.js', 'client');
});
