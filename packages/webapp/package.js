Package.describe({
  summary: "Serves a Meteor app over HTTP",
  internal: true
});

Npm.depends({connect: "2.7.10",
             send: "0.1.0",
             useragent: "2.0.1"});

Package.on_use(function (api) {
  // XXX: Refactor so as not to have to use ctl-helper
  api.use(['logging', 'underscore', 'routepolicy'], 'server');
  api.add_files('webapp_server.js', 'server');
});
