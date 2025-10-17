Package.describe({
  name: "local:my-package",
  version: "0.0.1",
  summary: "Smoke-test package for npm rebuild behavior",
});

Npm.depends({
  "left-pad": "1.3.0",
});

Package.onUse(function (api) {
  api.versionsFrom("2.3");
  api.use("ecmascript");
  api.mainModule("main.js");
});

Package.onTest(function (api) {
  api.use(["tinytest", "ecmascript", "local:my-package"]);
  api.addFiles("tests.js");
});
