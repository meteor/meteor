Package.describe({
  summary: "Serves a Meteor app over HTTP",
  internal: true
});

Npm.depends({connect: "1.9.2",
             // allow clientMaxAge to be set to 0:
             // https://github.com/tomgco/gzippo/pull/49
             gzippo: "https://github.com/meteor/gzippo/tarball/1e4b955439abc643879ae264b28a761521818f3b",
             useragent: "2.0.1"});

Package.on_use(function (api) {
  api.use(['underscore'], 'server');
  api.add_files('webapp_server.js', 'server');
});
