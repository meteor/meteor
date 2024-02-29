Package.describe({
  name: "synced-cron",
  summary:
    "Allows you to define and run scheduled jobs across multiple servers.",
  version: "2.0.2"
});

Npm.depends({ "@breejs/later": "4.1.0" });

Package.onUse(function (api) {
  api.use('ecmascript');
  
  api.use(
    ["check", "mongo", "logging"],
    "server",
  );

  api.addFiles(["synced-cron-server.js"], "server");

  api.export("SyncedCron", "server");
});

Package.onTest(function (api) {
  api.use(["check", "mongo"], "server");
  api.use(["tinytest", "logging"]);

  api.addFiles(["synced-cron-server.js", "synced-cron-tests.js"], ["server"]);
});
