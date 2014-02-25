Npm.depends({"meteor-test-executable": "0.0.1"});

Package.on_use(function (api) {
  api.add_files("npmtest.js", "server");
});
