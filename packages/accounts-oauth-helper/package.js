Package.describe({
  summary: "Common code for OAuth-based login services",
  internal: true
});

Package.on_use(function (api) {
  api.use('accounts', ['client', 'server']);

  api.add_files('oauth_common.js', ['client', 'server']);
  api.add_files('oauth_client.js', 'client');
  api.add_files('oauth_server.js', 'server');
});

Package.on_test(function (api) {
  // XXX Fix these!
  // api.use('accounts-oauth-helper', 'server');
  // api.add_files("oauth_tests.js", 'server');
});
