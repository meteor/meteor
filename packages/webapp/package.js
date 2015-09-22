Package.describe({
  summary: "Serves a Meteor app over HTTP",
  version: '1.2.2'
});

Npm.depends({connect: "2.9.0",
             send: "0.1.4",
             useragent: "2.0.7"});

Npm.strip({
  multiparty: ["test/"],
  useragent: ["test/"]
});

Cordova.depends({
  'cordova-plugin-device': '1.0.1',
  'cordova-plugin-legacy-whitelist': '1.1.0',
  // the cordova plugin built by Meteor Core team that "emulates a server" on
  // the mobile device. Serving the files and checking for the HCP updates.
  'com.meteor.cordova-update': 'https://github.com/meteor/com.meteor.cordova-update.git#16c53f53e438fc8b1b9c768de36f0a8974e38b49'
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
