Package.describe({
  version: "1.0.0",
  summary: "depend on and watch a plugin"
});

Package.on_use(function (api) {
  api.add_files('foo.js');
  api.use('contains-plugin');
});
