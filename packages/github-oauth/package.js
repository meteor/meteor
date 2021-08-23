Package.describe({
  summary: 'GitHub OAuth flow',
  version: '1.3.1'
});

Package.onUse(api => {
  api.use('ecmascript', ['client', 'server']);
  api.use('oauth2', ['client', 'server']);
  api.use('oauth', ['client', 'server']);
  api.use('http@1.4.4 || 2.0.0', 'server');
  api.use('random', 'client');
  api.use('service-configuration', ['client', 'server']);

  api.addFiles('github_client.js', 'client');
  api.addFiles('github_server.js', 'server');

  api.export('Github');
});
