Package.describe({
  summary: "Common code for OAuth2-based login services",
  version: '2.0.0-alpha300.5',
});

Package.onUse(api => {
  api.use([
    'random'
  ], 'server');

  api.use([
    'oauth',
    'service-configuration',
    'ecmascript',
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
    'oauth-encryption',
    'ecmascript',
  ], 'server');

  api.addFiles("oauth2_tests.js", 'server');
});
