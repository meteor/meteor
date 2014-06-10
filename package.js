Package.describe({
  summary: "Allows you to define and run scheduled jobs across multiple servers."
});

Npm.depends({later: "1.1.6"});

Package.on_use(function (api) {
  api.use(['underscore', 'check'], 'server');
  
  api.add_files(['synced-cron-server.js'], "server");
  
  api.export('SyncedCron', 'server');
});

Package.on_test(function (api) {
  api.use(['synced-cron', 'tinytest']);
  api.add_files('synced-cron-tests.js', ['server']);
});