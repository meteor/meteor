Package.describe({
  summary: "Dictionary data structure allowing non-string keys",
  version: "1.2.0",
});

Package.onUse(function (api) {
  api.use("ecmascript");
  api.use("ejson");
  api.mainModule("id-map.js");
  api.export("IdMap");
  api.addAssets("id-map.d.ts", "server");
});

Package.onTest(function (api) {
  api.use(["ecmascript", "tinytest", "ejson", "id-map"]);
  api.addFiles("id-map-tests.js", ["client", "server"]);
});
