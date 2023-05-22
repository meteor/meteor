Package.describe({
  summary: 'Define and run db migrations.',
  version: '1.1.0',
  name: 'percolate:migrations',
  git: 'https://github.com/percolatestudio/meteor-migrations.git',
});

Package.onUse(function(api) {
  api.versionsFrom('METEOR@1.9.3');
  api.use('ecmascript');
  api.use(['check', 'mongo', 'logging'], 'server');
  api.mainModule('migrations_server.js', 'server');
  api.export('Migrations', 'server');
});

Package.onTest(function(api) {
  api.use('ecmascript');
  api.use(['percolate:migrations', 'tinytest']);
  api.addFiles('migrations_tests.js', ['server']);
});
