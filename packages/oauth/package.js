Package.describe({
  summary: "Common code for OAuth-based services",
  version: "1.0.0",
  internal: true
});

Package.on_use(function (api) {
  api.use('routepolicy', 'server');
  api.use('webapp', 'server');
  api.use(['underscore', 'service-configuration', 'logging'], 'server');

  api.export('Oauth');
  api.export('OauthTest', 'server', {testOnly: true});

  api.add_files('oauth_client.js', 'client');
  api.add_files('oauth_server.js', 'server');
});
