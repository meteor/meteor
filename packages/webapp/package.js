Package.describe({
  summary: "Serves a Meteor app over HTTP",
  version: '1.2.0'
});

Npm.depends({connect: "2.9.0",
             send: "0.1.4",
             useragent: "2.0.7"});

Npm.strip({
  multiparty: ["test/"],
  useragent: ["test/"]
});

Cordova.depends({
  'org.apache.cordova.device': '0.2.13',
  // the cordova plugin built by Meteor Core team that "emulates a server" on
  // the mobile device. Serving the files and checking for the HCP updates.
  'com.meteor.cordova-update': 'https://github.com/meteor/com.meteor.cordova-update/tarball/92fe99b7248075318f6446b288995d4381d24cd2'
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
  api.use(['tinytest', 'webapp', 'http']);
  api.addFiles('webapp_tests.js', 'server');
  api.addFiles('webapp_client_tests.js', 'client');
});
