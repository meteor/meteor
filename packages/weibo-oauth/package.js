Package.describe({
  summary: "Weibo OAuth flow",
  version: "1.2.0"
});

Package.onUse(function(api) {
  api.use('oauth1', ['client', 'server']);
  api.use('oauth', ['client', 'server']);
  api.use('random', 'client');
  api.use('underscore', 'server');
  api.use('service-configuration', ['client', 'server']);

  api.addFiles('weibo_client.js', 'client');
  api.addFiles('weibo_server.js', 'server');

  api.export('Weibo');
});
