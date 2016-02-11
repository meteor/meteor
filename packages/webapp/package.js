Package.describe({
  summary: "Serves a Meteor app over HTTP",
  version: '1.2.4-cordova.3'
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
  'cordova-plugin-whitelist': '1.2.1',
  'cordova-plugin-wkwebview-engine': '1.0.1',
  'cordova-plugin-meteor-webapp': 'https://github.com/meteor/cordova-plugin-meteor-webapp.git#fd6d05bafd118a5ad564a860127b2dbb0748b02b'
});

Package.onUse(function (api) {
  api.use(['logging', 'underscore', 'routepolicy', 'boilerplate-generator',
           'webapp-hashing'], 'server');
  api.use(['underscore'], 'client');

  // At response serving time, webapp uses browser-policy if it is loaded. If
  // browser-policy is loaded, then it must be loaded after webapp
  // (browser-policy depends on webapp). So we don't explicitly depend in any
  // way on browser-policy here, but we use it when it is loaded, and it can be
  // loaded after webapp.
  api.export(['WebApp', 'main', 'WebAppInternals'], 'server');
  api.export(['WebApp'], 'client');
  api.addFiles('webapp_server.js', 'server');
  api.addFiles('webapp_client.js', 'client');
});

Package.onTest(function (api) {
  api.use(['tinytest', 'webapp', 'http', 'underscore']);
  api.addFiles('webapp_tests.js', 'server');
  api.addFiles('webapp_client_tests.js', 'client');
});
