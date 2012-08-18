Package.describe({
  summary: "Common code for OAuth1-based login services",
  internal: true
});

Package.on_use(function (api) {
  api.use('accounts-oauth-helper', 'client');

  api.add_files('oauth1.js', 'server');
  api.add_files('oauth1_common.js', ['client', 'server']);
  api.add_files('oauth1_server.js', 'server');
});

Package.on_test(function (api) {
  // XXX Fix these!
  // api.use('accounts-oauth1-helper', 'server');
  // api.add_files("oauth1_tests.js", 'server');
});
