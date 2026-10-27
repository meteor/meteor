Package.describe({
  summary: "Common code for OAuth-based services",
  version: '3.0.2_1',
});

Package.onUse(api => {
  // Keep the published dependency floors for independent package updates.
  api.use('meteor@2.1.0');
  api.use(['check@1.4.4', 'ecmascript@0.16.10', 'localstorage@1.2.1', 'url@1.3.5']);

  api.use(['routepolicy@1.1.2', 'webapp@2.0.5', 'mongo@2.1.1', 'service-configuration@1.3.5', 'logging@1.3.6'], 'server');

  api.use(['reload@1.3.2', 'base64@1.0.13'], 'client');

  api.use('oauth-encryption@1.3.3', 'server', {weak: true});
  api.use('fetch@0.1.6', 'server');


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
  'body-parser': '1.20.9',
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
