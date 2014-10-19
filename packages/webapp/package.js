Package.describe({
  summary: "Serves a Meteor app over HTTP",
  version: '1.1.3'
});

Npm.depends({connect: "2.9.0",
             send: "0.1.4",
             useragent: "2.0.7"});

Npm.strip({
  multiparty: ["test/"],
  useragent: ["test/"]
});

Package.on_use(function (api) {
  api.use(['logging', 'underscore', 'routepolicy', 'boilerplate-generator',
           'spacebars', 'htmljs', 'blaze', 'webapp-hashing'], 'server');
  api.use(['underscore'], 'client');
  api.use(['application-configuration', 'follower-livedata'], {
    unordered: true
  });
  // At response serving time, webapp uses browser-policy if it is loaded. If
  // browser-policy is loaded, then it must be loaded after webapp
  // (browser-policy depends on webapp). So we don't explicitly depend in any
  // way on browser-policy here, but we use it when it is loaded, and it can be
  // loaded after webapp.
  api.export(['WebApp', 'main', 'WebAppInternals'], 'server');
  api.export(['WebApp'], 'client');
  api.add_files('webapp_server.js', 'server');
  api.add_files('webapp_client.js', 'client');
});

Package.on_test(function (api) {
  api.use(['tinytest', 'webapp', 'http']);
  api.add_files('webapp_tests.js', 'server');
});
