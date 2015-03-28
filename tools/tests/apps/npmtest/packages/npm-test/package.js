Npm.depends({"meteor-test-executable": "0.0.3"});

Package.describe({
  version: "1.0.0",
  summary: "test npm"
});

Package.onUse(function (api) {
  api.addFiles("npmtest.js", "server");
});
