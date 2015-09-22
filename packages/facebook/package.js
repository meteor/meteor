Package.describe({
  summary: "Facebook OAuth flow",
  version: "1.2.2"
});

Package.onUse(function(api) {
  api.use('oauth2', ['client', 'server']);
  api.use('oauth', ['client', 'server']);
  api.use('http', ['server']);
  api.use('templating', 'client');
  api.use('underscore', 'server');
  api.use('random', 'client');
  api.use('service-configuration', ['client', 'server']);

  api.export('Facebook');

  api.addFiles(
    ['facebook_configure.html', 'facebook_configure.js'],
    'client');

  api.addFiles('facebook_server.js', 'server');
  api.addFiles('facebook_client.js', 'client');
});
