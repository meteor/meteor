Package.describe({
  version: "1.0.0",
  summary: "depend on and watch a plugin"
});

Package.onUse(function (api) {
  api.addFiles('foo.js');
  api.use('contains-plugin');
});
