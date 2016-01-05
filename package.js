Package.describe({
  summary: "Define and run db migrations.",
  version: "0.9.8",
  name: "percolate:migrations",
  git: "https://github.com/percolatestudio/meteor-migrations.git"
});

Package.on_use(function (api) {
  api.versionsFrom('METEOR@0.9.1.1');
  api.use(['underscore', 'check', 'mongo', 'logging'], 'server');
  api.addFiles(['migrations_server.js'], "server");
  api.export('Migrations', 'server');
});

Package.on_test(function (api) {
  api.use(['percolate:migrations', 'tinytest']);
  api.addFiles('migrations_tests.js', ['server']);
});
