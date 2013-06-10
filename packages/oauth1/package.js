Package.describe({
  summary: "Common code for OAuth1-based login services",
  internal: true
});

Package.on_use(function (api) {
  api.use('service-configuration', ['client', 'server']);
  api.use('oauth', 'client');

  api.add_files('oauth1_binding.js', 'server');
  api.add_files('oauth1_common.js', ['client', 'server']);
  api.add_files('oauth1_server.js', 'server');
});

Package.on_test(function (api) {
  api.use('service-configuration', 'server');
  api.use('oauth1', 'server');
  api.add_files("oauth1_tests.js", 'server');
});
