Package.describe({
  summary: "Common code for OAuth2-based login services",
  version: "1.1.5"
});

Package.onUse(function (api) {
  api.use([
    'random'
  ], 'server');

  api.use([
    'oauth',
    'service-configuration'
  ], ['client', 'server']);

  api.addFiles('oauth2_server.js', 'server');
});

Package.onTest(function (api) {
  api.use([
    'tinytest',
    'random',
    'oauth2',
    'oauth',
    'service-configuration',
    'oauth-encryption'
  ], 'server');

  api.addFiles("oauth2_tests.js", 'server');
});
