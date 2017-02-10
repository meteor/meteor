Package.describe({
  summary: "Google OAuth flow",
  version: "1.2.0"
});

Package.onUse(function(api) {
  api.use('oauth2', ['client', 'server']);
  api.use('oauth', ['client', 'server']);
  api.use('http', ['server']);
  api.use(['underscore', 'service-configuration'], ['client', 'server']);
  api.use('random', 'client');

  api.addFiles('google_server.js', 'server');
  api.addFiles('google_client.js', 'client');

  api.export('Google');
});
