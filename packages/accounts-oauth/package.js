Package.describe({
  summary: "Common code for OAuth-based login services",
  internal: true
});

Package.on_use(function (api) {
  api.use('underscore', ['client', 'server']);
  api.use('random', ['client', 'server']);
  api.use('check', ['client', 'server']);
  api.use('webapp', 'server');
  api.use('accounts-base', ['client', 'server']);
  // Export Accounts (etc) to packages using this one.
  api.imply('accounts-base', ['client', 'server']);
  api.use('oauth', 'server');

  api.add_files('oauth_common.js');
  api.add_files('oauth_client.js', 'client');
  api.add_files('oauth_server.js', 'server');
});


Package.on_test(function (api) {
  api.add_files("oauth_tests.js", 'server');
});
