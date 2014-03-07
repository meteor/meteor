Package.describe({
  summary: "Default control program for an application",
  internal: true
});

Package.on_use(function (api) {
  api.use(['underscore', 'livedata', 'mongo-livedata', 'ctl-helper', 'application-configuration', 'follower-livedata'], 'server');
  api.export('main', 'server');
  api.add_files('ctl.js', 'server');
});
