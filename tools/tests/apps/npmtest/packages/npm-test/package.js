Npm.depends({"meteor-test-executable": "0.0.1"});

Package.describe({
  version: "1.0.0",
  summary: "test npm"
});

Package.on_use(function (api) {
  api.add_files("npmtest.js", "server");
});
