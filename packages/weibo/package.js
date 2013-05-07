Package.describe({
  summary: "Login service for Weibo accounts"
});

Package.on_use(function(api) {
  api.use('oauth2', ['client', 'server']);
  api.use('http', ['client', 'server']);
  api.use('templating', 'client');

  api.add_files(
    ['weibo_configure.html', 'weibo_configure.js'],
    'client');

  api.add_files('weibo_common.js', ['client', 'server']);
  api.add_files('weibo_server.js', 'server');
  api.add_files('weibo_client.js', 'client');
});
