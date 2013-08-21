Package.describe({
  summary: "Interaction with the configuration sources for your apps",
  internal: true
});

Package.on_use(function (api) {
  api.use(['underscore', 'livedata', 'ejson']);
  api.use(['mongo-livedata'], {
    unordered: true
  });
  api.add_files(['config.js'], 'server');
  api.export('AppConfig', 'server');
});
