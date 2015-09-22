Package.describe({
  summary: "Reload safety belt for multi-server deployments",
  version: '1.0.5'
});

Package.onUse(function (api) {
  api.use("webapp", "server");
  api.addFiles("reload-safety-belt.js", "server");
  api.addAssets("safetybelt.js", "server");
});

Package.onTest(function (api) {
  api.addAssets("safetybelt.js", "server");
  api.use(["reload-safetybelt", "tinytest", "http", "webapp", "underscore"]);
  api.addFiles("reload-safety-belt-tests.js", "server");
});
