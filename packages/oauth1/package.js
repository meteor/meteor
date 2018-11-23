Package.describe({
  summary: "Common code for OAuth1-based login services",
  version: "1.2.2",
});

Package.onUse(api => {
  api.use('ecmascript', ['client', 'server']);
  api.use('random');
  api.use('service-configuration', ['client', 'server']);
  api.use('oauth', ['client', 'server']);
  api.use([
    'check',
    'http'
  ], 'server');

  api.use('mongo');

  api.export('OAuth1Binding', 'server');
  api.export('OAuth1Test', 'server', {testOnly: true});

  api.addFiles('oauth1_binding.js', 'server');
  api.addFiles('oauth1_server.js', 'server');
  api.addFiles('oauth1_pending_request_tokens.js', 'server');
});

Package.onTest(api => {
  api.use('ecmascript', 'server');
  api.use('tinytest');
  api.use('random');
  api.use('service-configuration', 'server');
  api.use('oauth-encryption', 'server');
  api.use('oauth1', 'server');
  api.use('oauth', 'server');
  api.addFiles("oauth1_tests.js", 'server');
});
