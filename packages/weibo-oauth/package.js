Package.describe({
  summary: "Weibo OAuth flow",
  version: '1.3.3-rc300.1',
});

Package.onUse(api => {
  api.use('oauth1', ['client', 'server']);
  api.use('oauth', ['client', 'server']);
  api.use('random', 'client');
  api.use(['service-configuration', 'ecmascript'], ['client', 'server']);

  api.addFiles('weibo_client.js', 'client');
  api.addFiles('weibo_server.js', 'server');

  api.export('Weibo');
});

Package.onTest(function(api) {
  api.use('weibo-oauth');
  api.use(['tinytest', 'ecmascript', 'test-helpers', 'oauth', 'oauth2', 'service-configuration']);
  api.addFiles('weibo-oauth_tests.js');
});
