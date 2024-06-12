Package.describe({
  summary: "Common code for OAuth2-based login services",
  version: '1.3.3-rc300.3',
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
