Package.describe({
  summary: "Weibo OAuth flow",
  version: "1.3.1",
});

Package.onUse(api => {
  api.use('oauth1', ['client', 'server']);
  api.use('oauth', ['client', 'server']);
  api.use('random', 'client');
  api.use('http@1.4.4 || 2.0.0', 'server');
  api.use(['service-configuration', 'ecmascript'], ['client', 'server']);

  api.addFiles('weibo_client.js', 'client');
  api.addFiles('weibo_server.js', 'server');

  api.export('Weibo');
});
