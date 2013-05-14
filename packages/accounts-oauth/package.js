Package.describe({
  summary: "Common code for OAuth-based accounts services",
  internal: true
});

Package.on_use(function (api) {
  api.use('routepolicy', 'server');
  api.use('oauth', 'server');

  api.add_files('oauth_common.js', ['client', 'server']);
  api.add_files('oauth_client.js', 'client');
  api.add_files('oauth_server.js', 'server');
});


Package.on_test(function (api) {
  api.add_files("oauth_tests.js", 'server');
});
