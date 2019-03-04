Package.describe({
  summary: "Common code for OAuth-based login services",
  version: "1.1.16",
});

Package.onUse(api => {
  api.use('check', 'server');
  api.use('webapp', 'server');
  api.use(['accounts-base', 'ecmascript'], ['client', 'server']);
  // Export Accounts (etc) to packages using this one.
  api.imply('accounts-base', ['client', 'server']);
  api.use('oauth');

  api.addFiles('oauth_common.js');
  api.addFiles('oauth_client.js', 'client');
  api.addFiles('oauth_server.js', 'server');
});


Package.onTest(api => {
  api.addFiles("oauth_tests.js", 'server');
});
