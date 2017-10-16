Package.describe({
  summary: "Serves a Meteor app over HTTP",
  version: '1.3.19'
});

Npm.depends({connect: "2.30.2",
             parseurl: "1.3.0",
             send: "0.13.0",
             useragent: "2.0.7"});

Npm.strip({
  multiparty: ["test/"],
  useragent: ["test/"]
});

Cordova.depends({
  'cordova-plugin-whitelist': '1.3.2',
  'cordova-plugin-wkwebview-engine': '1.1.3',
  'cordova-plugin-meteor-webapp': '1.4.2'
});

Package.onUse(function (api) {
  api.use('ecmascript');
  api.use(['logging', 'underscore', 'routepolicy', 'boilerplate-generator',
           'webapp-hashing'], 'server');
  api.use(['underscore'], 'client');

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
});
