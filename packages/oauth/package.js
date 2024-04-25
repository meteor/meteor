Package.describe({
  summary: "Common code for OAuth-based services",
  version: '3.0.0-rc300.0',
});

Package.onUse(api => {
  api.use(['check', 'ecmascript', 'localstorage', 'url']);

  api.use(['routepolicy', 'webapp', 'mongo', 'service-configuration', 'logging'], 'server');

  api.use(['reload', 'base64'], 'client');

  api.use('oauth-encryption', 'server', {weak: true});
  api.use('fetch', 'server');


  api.export('OAuth');
  api.export('OAuthTest', 'server', {testOnly: true});

  api.addFiles('oauth_client.js', 'web');
  api.addFiles('oauth_browser.js', 'web.browser');
  api.addFiles('oauth_cordova.js', 'web.cordova');
  api.addFiles('oauth_server.js', 'server');
  api.addFiles('pending_credentials.js', 'server');

  api.addAssets([
    'end_of_popup_response.html',
    'end_of_redirect_response.html'
  ], 'server');

  api.addAssets([
    'end_of_popup_response.js',
    'end_of_redirect_response.js'
  ], 'client');

  api.addFiles('oauth_common.js');
});

Npm.depends({
  'body-parser': '1.19.0',
});

Package.onTest(api => {
  api.use('tinytest');
  api.use('random');
  api.use('service-configuration', 'server');
  api.use('oauth', 'server');
  api.addFiles("oauth_tests.js", 'server');
});

Cordova.depends({
  'cordova-plugin-inappbrowser': '5.0.0'
});
