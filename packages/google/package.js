Package.describe({
  summary: "Google OAuth flow",
  version: "1.1.5"
});

Package.onUse(function(api) {
  api.use('oauth2', ['client', 'server']);
  api.use('oauth', ['client', 'server']);
  api.use('http', ['server']);
  api.use(['underscore', 'service-configuration'], ['client', 'server']);
  api.use(['random', 'templating'], 'client');

  api.export('Google');

  api.addFiles(
    ['google_configure.html', 'google_configure.js'],
    'client');

  api.addFiles('google_server.js', 'server');
  api.addFiles('google_client.js', 'client');
});
