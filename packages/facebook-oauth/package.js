Package.describe({
  summary: "Facebook OAuth flow",
  version: "1.9.0-beta230.4"
});

Package.onUse(api => {
  api.use('ecmascript', ['client', 'server']);
  api.use('oauth2', ['client', 'server']);
  api.use('oauth', ['client', 'server']);
  api.use('http@1.4.3', ['server']);
  api.use('random', 'client');
  api.use('service-configuration', ['client', 'server']);

  api.addFiles('facebook_client.js', 'client');
  api.addFiles('facebook_server.js', 'server');

  api.export('Facebook');
});
