Package.describe({
  summary: "Reload safety belt for multi-server deployments",
  version: '2.0.0-rc300.5',
});

Package.onUse(function (api) {
  api.use("ecmascript");
  api.use("webapp", "server");
  api.addFiles("reload-safety-belt.js", "server");
  api.addAssets("safetybelt.js", "server");
});

Package.onTest(function (api) {
  api.use("ecmascript");
  api.addAssets("safetybelt.js", "server");
  api.use(["reload-safetybelt", "tinytest", "http", "webapp"]);
  api.addFiles("reload-safety-belt-tests.js", "server");
});
