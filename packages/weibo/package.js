Package.describe({
  summary: "Weibo OAuth flow",
  version: '1.1.8',
  git: 'https://github.com/meteor/meteor/tree/master/packages/weibo'
});

Package.onUse(function(api) {
  api.use('oauth2', ['client', 'server']);
  api.use('oauth', ['client', 'server']);
  api.use('http', ['server']);
  api.use('templating', 'client');
  api.use('random', 'client');
  api.use('service-configuration', ['client', 'server']);

  api.export('Weibo');

  api.addFiles(
    ['weibo_configure.html', 'weibo_configure.js'],
    'client');

  api.addFiles('weibo_server.js', 'server');
  api.addFiles('weibo_client.js', 'client');
});
