Package.describe({
  summary: "Common code for OAuth2-based login services",
  version: "1.1.0"
});

Package.on_use(function (api) {
  api.use('service-configuration', ['client', 'server']);
  api.use('oauth', ['client', 'server']);

  api.add_files('oauth2_server.js', 'server');
});

Package.on_test(function (api) {
  api.use(['tinytest', 'random', 'oauth2', 'oauth', 'service-configuration', 'oauth-encryption'],
          'server');
  api.add_files("oauth2_tests.js", 'server');
});
