Package.describe({
  summary: "Google OAuth flow",
  version: "1.1.1"
});

Package.on_use(function(api) {
  api.use('oauth2', ['client', 'server']);
  api.use('oauth', ['client', 'server']);
  api.use('http', ['server']);
  api.use(['underscore', 'service-configuration'], ['client', 'server']);
  api.use(['random', 'templating'], 'client');

  api.export('Google');

  api.add_files(
    ['google_configure.html', 'google_configure.js'],
    'client');

  api.add_files('google_server.js', 'server');
  api.add_files('google_client.js', 'client');
});
