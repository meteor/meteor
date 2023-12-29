Package.describe({
  summary: 'GitHub OAuth flow',
  version: '1.4.2-beta300.0'
});

Package.onUse(api => {
  api.use('ecmascript', ['client', 'server']);
  api.use('oauth2', ['client', 'server']);
  api.use('oauth', ['client', 'server']);
  api.use('fetch', 'server');
  api.use('random', 'client');
  api.use('service-configuration', ['client', 'server']);

  api.addFiles('github_client.js', 'client');
  api.addFiles('github_server.js', 'server');

  api.export('Github');
});
