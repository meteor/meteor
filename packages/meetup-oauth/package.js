Package.describe({
  summary: 'Meetup OAuth flow',
  version: '1.1.3',
});

Package.onUse(api => {
  api.use('ecmascript');
  api.use('oauth2', ['client', 'server']);
  api.use('oauth', ['client', 'server']);
  api.use('random', 'client');
  api.use('service-configuration', ['client', 'server']);

  api.addFiles('meetup_server.js', 'server');
  api.addFiles('meetup_client.js', 'client');

  api.export('Meetup');
});

Package.onTest(function(api) {
  api.use('meetup-oauth');
  api.use(['tinytest', 'ecmascript', 'test-helpers', 'oauth', 'oauth2', 'service-configuration']);
  api.addFiles('meetup-oauth_tests.js');
});
