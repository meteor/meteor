Package.describe({
  summary: "Facebook OAuth flow",
  version: '1.11.3-rc300.6',
});

Package.onUse(api => {
  api.use('ecmascript', ['client', 'server']);
  api.use('oauth2', ['client', 'server']);
  api.use('oauth', ['client', 'server']);
  api.use('random', 'client');
  api.use('service-configuration', ['client', 'server']);

  api.addFiles('facebook_client.js', 'client');
  api.addFiles('facebook_server.js', 'server');

  api.export('Facebook');
});

Package.onTest(function(api) {
  api.use('facebook-oauth');
  api.use(['tinytest', 'ecmascript', 'test-helpers', 'oauth', 'oauth2', 'service-configuration']);
  api.addFiles('facebook-oauth_tests.js');
});
