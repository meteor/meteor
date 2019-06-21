Package.describe({
  summary: "Serves a Meteor app over HTTP",
  version: '1.7.4'
});

Npm.depends({"basic-auth-connect": "1.0.0",
             "cookie-parser": "1.4.3",
             connect: "3.6.5",
             compression: "1.7.1",
             errorhandler: "1.5.0",
             parseurl: "1.3.2",
             send: "0.16.1",
             "stream-to-string": "1.1.0",
             "qs-middleware": "1.0.3",
             useragent: "2.3.0"});

Npm.strip({
  multiparty: ["test/"],
  useragent: ["test/"]
});

Cordova.depends({
  'cordova-plugin-whitelist': '1.3.3',
  'cordova-plugin-wkwebview-engine': '1.1.4',
  'cordova-plugin-meteor-webapp': '1.7.0'
});

Package.onUse(function (api) {
  api.use('ecmascript');
  api.use([
    'logging',
    'underscore',
    'routepolicy',
    'modern-browsers',
    'boilerplate-generator',
    'webapp-hashing',
    'inter-process-messaging',
  ], 'server');

  // At response serving time, webapp uses browser-policy if it is loaded. If
  // browser-policy is loaded, then it must be loaded after webapp
  // (browser-policy depends on webapp). So we don't explicitly depend in any
  // way on browser-policy here, but we use it when it is loaded, and it can be
  // loaded after webapp.
  api.mainModule('webapp_server.js', 'server');
  api.export('WebApp', 'server');
  api.export('WebAppInternals', 'server');
  api.export('main', 'server');

  api.mainModule('webapp_client.js', 'client');
  api.export('WebApp', 'client');

  api.mainModule('webapp_cordova.js', 'web.cordova');
});

Package.onTest(function (api) {
  api.use(['tinytest', 'ecmascript', 'webapp', 'http', 'underscore']);
  api.addFiles('webapp_tests.js', 'server');
  api.addFiles('webapp_client_tests.js', 'client');
  api.addFiles('socket_file_tests.js', 'server');

  api.addAssets('modern_test_asset.js', 'web.browser');
  api.addAssets('legacy_test_asset.js', 'legacy');
});
