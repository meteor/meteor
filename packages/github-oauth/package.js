Package.describe({
  summary: 'GitHub OAuth flow',
  version: '1.4.2-rc300.9',
});

Package.onUse(api => {
  api.use('ecmascript', ['client', 'server']);
  api.use('oauth2', ['client', 'server']);
  api.use('oauth', ['client', 'server']);
  api.use('fetch', 'server');
  api.use('random', 'client');
  api.use('accounts-base', ['client', 'server']);
  api.use('service-configuration', ['client', 'server']);

  api.addFiles('github_client.js', 'client');
  api.addFiles('github_server.js', 'server');

  api.export('Github');
});

Package.onTest(function(api) {
  api.use('github-oauth');
  api.use(['tinytest', 'ecmascript', 'test-helpers', 'oauth', 'oauth2', 'service-configuration']);
  api.addFiles('github-oauth_tests.js');
});
