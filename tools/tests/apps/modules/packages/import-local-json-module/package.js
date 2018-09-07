Package.describe({
  name: "import-local-json-module",
  version: "0.0.1",
  summary: "Regression test for issue #10122",
  documentation: null
});

Package.onUse(function(api) {
  api.use("ecmascript");
  api.mainModule("main.js");
});
