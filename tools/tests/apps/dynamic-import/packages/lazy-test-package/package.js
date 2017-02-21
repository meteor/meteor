Package.describe({
  name: "lazy-test-package",
  version: "0.0.1",
});

Package.onUse(function(api) {
  api.use("ecmascript");
  api.use("helper-package");

  api.mainModule("main.js", [
    "client",
    "server"
  ], {
    lazy: true
  });
});
