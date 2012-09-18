Package.describe({
  summary: "Login service for Google accounts"
});

Package.on_use(function(api) {
  api.use('accounts-base', ['client', 'server']);
  api.use('accounts-oauth2-helper', ['client', 'server']);
  api.use('http', ['client', 'server']);
  api.use('templating', 'client');

  api.add_files(
    ['google_configure.html', 'google_configure.js'],
    'client');

  api.add_files('google_common.js', ['client', 'server']);
  api.add_files('google_server.js', 'server');
  api.add_files('google_client.js', 'client');
});
