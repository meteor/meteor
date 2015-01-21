Package.describe({
  summary: "Default control program for an application",
  version: "1.0.3"
});

Package.onUse(function (api) {
  api.use(['underscore', 'ddp', 'mongo', 'ctl-helper', 'application-configuration', 'follower-livedata'], 'server');
  api.export('main', 'server');
  api.addFiles('ctl.js', 'server');
});
