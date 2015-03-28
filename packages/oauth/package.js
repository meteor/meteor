Package.describe({
  summary: "Common code for OAuth-based services",
  version: "1.1.4"
});

Package.onUse(function (api) {
  api.use('routepolicy', 'server');
  api.use('webapp', 'server');
  api.use('mongo', 'server');
  api.use('reload', 'client');
  api.use('base64', 'client');

  api.use(['underscore', 'service-configuration', 'logging'], 'server');

  api.use('oauth-encryption', 'server', {weak: true});

  api.use('localstorage');
  api.use('url');

  api.export('OAuth');
  api.export('OAuthTest', 'server', {testOnly: true});

  api.addFiles('oauth_client.js', 'web');
  api.addFiles('oauth_browser.js', 'web.browser');
  api.addFiles('oauth_cordova.js', 'web.cordova');
  api.addFiles('oauth_server.js', 'server');
  api.addFiles('pending_credentials.js', 'server');

  api.addFiles('end_of_popup_response.html', 'server', { isAsset: true });
  api.addFiles('end_of_redirect_response.html', 'server', {isAsset: true});

  api.addFiles('oauth_common.js');

  // XXX COMPAT WITH 0.8.0
  api.export('Oauth');
  api.addFiles('deprecated.js', ['client', 'server']);
});


Package.onTest(function (api) {
  api.use('tinytest');
  api.use('random');
  api.use('service-configuration', 'server');
  api.use('oauth', 'server');
  api.addFiles("oauth_tests.js", 'server');
});

Cordova.depends({
  'org.apache.cordova.inappbrowser': '0.6.0'
});

