Package.describe({
  summary: "Integration with google accounts",
});

Package.on_use(function(api) {
  api.use('accounts', ['client', 'server']);
  api.use('accounts-oauth2-helper', ['client', 'server']);
  api.use('http', ['client', 'server']);

  api.add_files('google_common.js', ['client', 'server']);
  api.add_files('google_server.js', 'server');
  api.add_files('google_client.js', 'client');
});
