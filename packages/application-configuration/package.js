Package.describe({
  summary: "Interaction with the configuration sources for your apps",
  version: '1.0.3'
});

Package.on_use(function (api) {
  api.use(['logging', 'underscore', 'ddp', 'ejson', 'follower-livedata']);
  api.use(['mongo'], {
    unordered: true
  });
  api.add_files(['config.js'], 'server');
  api.export('AppConfig', 'server');
});
