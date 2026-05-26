Package.describe({
  summary: "Express middleware and authenticated request helpers for Meteor accounts",
  version: "1.0.0-beta350.11",
});

Package.onUse((api) => {
  api.use("ecmascript", ["client", "server"]);
  api.use("accounts-base", ["client", "server"]);
  api.use("webapp", "server");

  api.imply("accounts-base", ["client", "server"]);

  api.export("handleFetch", ["client", "server"]);

  api.mainModule("server_main.js", "server");
  api.mainModule("client_main.js", "client");

  api.addAssets("accounts-express.d.ts", "server");
});

Package.onTest((api) => {
  api.use([
    "accounts-express",
    "accounts-base",
    "accounts-password",
    "ecmascript",
    "fetch",
    "tinytest",
    "random",
    "test-helpers",
    "webapp",
    "ddp",
  ]);

  api.addFiles("accounts_tests_setup.js", "server");
  api.mainModule("server_tests.js", "server");
  api.mainModule("client_tests.js", "client");
});
