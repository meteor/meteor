Package.describe({
  summary: "Weibo OAuth flow",
  version: '1.1.1'
});

Package.on_use(function(api) {
  api.use('oauth2', ['client', 'server']);
  api.use('oauth', ['client', 'server']);
  api.use('http', ['server']);
  api.use('templating', 'client');
  api.use('random', 'client');
  api.use('service-configuration', ['client', 'server']);

  api.export('Weibo');

  api.add_files(
    ['weibo_configure.html', 'weibo_configure.js'],
    'client');

  api.add_files('weibo_server.js', 'server');
  api.add_files('weibo_client.js', 'client');
});
