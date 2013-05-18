Package.describe({
  summary: "Common code for OAuth2-based login services",
  internal: true
});

Package.on_use(function (api) {
  api.use('service-configuration', ['client', 'server']);
  api.use('oauth', 'client');

  api.add_files('oauth2_common.js', ['client', 'server']);
  api.add_files('oauth2_server.js', 'server');
});

Package.on_test(function (api) {
  api.use('service-configuration', 'server');
  api.use('oauth2', 'server');
  api.add_files("oauth2_tests.js", 'server');
});
