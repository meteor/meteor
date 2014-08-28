Package.describe({
  summary: "Default control program for an application",
  version: "1.0.0"
});

Package.on_use(function (api) {
  api.use(['underscore', 'livedata', 'mongo', 'ctl-helper', 'application-configuration', 'follower-livedata'], 'server');
  api.export('main', 'server');
  api.add_files('ctl.js', 'server');
});
