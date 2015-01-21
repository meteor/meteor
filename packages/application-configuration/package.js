Package.describe({
  summary: "Interaction with the configuration sources for your apps",
  version: '1.0.4'
});

Package.onUse(function (api) {
  api.use(['logging', 'underscore', 'ddp', 'ejson', 'follower-livedata']);
  api.use(['mongo'], {
    unordered: true
  });
  api.addFiles(['config.js'], 'server');
  api.export('AppConfig', 'server');
});
