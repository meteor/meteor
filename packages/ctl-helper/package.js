Package.describe({
  summary: "Helpers for control programs",
  version: "1.0.5"
});

Npm.depends({optimist: '0.6.0'});

Package.onUse(function (api) {
  api.use(['logging', 'underscore', 'ddp', 'mongo', 'follower-livedata', 'application-configuration'], 'server');
  api.export('Ctl', 'server');
  api.addFiles('ctl-helper.js', 'server');
});
