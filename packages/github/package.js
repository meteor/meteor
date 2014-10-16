Package.describe({
  summary: "Github OAuth flow",
  version: "1.1.1"
});

Package.on_use(function(api) {
  api.use('oauth2', ['client', 'server']);
  api.use('oauth', ['client', 'server']);
  api.use('http', ['server']);
  api.use('underscore', 'client');
  api.use('templating', 'client');
  api.use('random', 'client');
  api.use('service-configuration', ['client', 'server']);

  api.export('Github');

  api.add_files(
    ['github_configure.html', 'github_configure.js'],
    'client');

  api.add_files('github_server.js', 'server');
  api.add_files('github_client.js', 'client');
});
