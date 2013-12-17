Package.describe({
  summary: "Serves a Meteor app over HTTP",
  internal: true
});

Npm.depends({connect: "2.9.0",
             send: "0.1.4",
             useragent: "2.0.7"});

Package.on_use(function (api) {
  api.use(['logging', 'underscore', 'routepolicy'], 'server');
  api.use(['application-configuration', 'follower-livedata'], {
    unordered: true
  });
  // At response serving time, webapp uses browser-policy if it is loaded. If
  // browser-policy is loaded, then it must be loaded after webapp
  // (browser-policy depends on webapp). So we don't explicitly depend in any
  // way on browser-policy here, but we use it when it is loaded, and it can be
  // loaded after webapp.
  api.export(['WebApp', 'main', 'WebAppInternals'], 'server');
  api.add_files('webapp_server.js', 'server');
});
