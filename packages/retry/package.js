Package.describe({
  summary: "Retry logic with exponential backoff",
  version: "1.1.1",
});

Package.onUse(function (api) {
  api.use("ecmascript");
  api.use("random");
  api.mainModule("retry.js");
  api.export("Retry");
  api.types("retry.d.ts");
});

Package.onTest(function (api) {
  api.use(["ecmascript", "tinytest", "random", "retry"]);
  api.addFiles("retry-tests.js", ["client", "server"]);
});
