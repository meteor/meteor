Package.describe({
  summary: 'GitHub OAuth flow',
  version: '1.2.1'
});

Package.onUse(function (api) {
  api.use('oauth2', ['client', 'server']);
  api.use('oauth', ['client', 'server']);
  api.use('http', ['server']);
  api.use('underscore', ['client', 'server']);
  api.use('random', 'client');
  api.use('service-configuration', ['client', 'server']);

  api.addFiles('github_client.js', 'client');
  api.addFiles('github_server.js', 'server');

  api.export('Github');
});
