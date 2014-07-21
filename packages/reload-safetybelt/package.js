Package.describe({
  summary: "Reload safety belt for multi-server deployments",
  internal: true
});

Package.on_use(function (api) {
  api.use("webapp", "server");
  api.add_files("reload-safety-belt.js", "server");
  api.add_files("safetybelt.js", "server", { isAsset: true });
});

Package.on_test(function (api) {
  api.add_files("safetybelt.js", "server", { isAsset: true });
  api.use(["reload-safetybelt", "tinytest", "http", "webapp"]);
  api.add_files("reload-safety-belt-tests.js", "server");
});
