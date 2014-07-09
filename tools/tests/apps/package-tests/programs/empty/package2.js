Package.describe({
  version: "1.0.0",
  summary: "now with dependencies"
});

Package.on_use(function (api) {
  api.use('depends-on-plugin');
});
