Package.describe({
  summary: 'Twitch OAuth flow',
  version: '1.0.0',
});

Package.onUse(api => {
  api.use('ecmascript', ['client', 'server']);
  api.use('oauth2', ['client', 'server']);
  api.use('oauth', ['client', 'server']);
  api.use('fetch', 'server');
  api.use('random', 'client');
  api.use('accounts-base', ['client', 'server']);
  api.use('service-configuration', ['client', 'server']);

  api.addFiles('twitch_client.js', 'client');
  api.addFiles('twitch_server.js', 'server');

  api.export('Twitch');
});

Package.onTest(function(api) {
  api.use('twitch-oauth');
  api.use(['tinytest', 'ecmascript', 'test-helpers', 'oauth', 'oauth2', 'service-configuration']);
  api.addFiles('twitch-oauth_tests.js');
});
