Package.describe({
  summary: "Common code for OAuth-based login services",
  version: "1.1.5"
});

Package.onUse(function (api) {
  api.use('underscore', ['client', 'server']);
  api.use('random', ['client', 'server']);
  api.use('check', ['client', 'server']);
  api.use('webapp', 'server');
  api.use('accounts-base', ['client', 'server']);
  // Export Accounts (etc) to packages using this one.
  api.imply('accounts-base', ['client', 'server']);
  api.use('oauth');

  api.addFiles('oauth_common.js');
  api.addFiles('oauth_client.js', 'client');
  api.addFiles('oauth_server.js', 'server');
});


Package.onTest(function (api) {
  api.addFiles("oauth_tests.js", 'server');
});
