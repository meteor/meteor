Package.describe({
  summary: "Register callbacks on a hook",
  version: "1.8.0",
});

Package.onUse(function (api) {
  api.use("ecmascript");
  api.mainModule("hook.js");
  api.export("Hook");
  api.addAssets("callback-hook.d.ts", "server");
});

Package.onTest(function (api) {
  api.use("callback-hook");
  api.use("tinytest");
  api.addFiles("hook_tests.js", "server");
});
