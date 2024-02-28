Package.describe({
  summary: 'Define and run db migrations.',
  version: '2.0.2',
  name: 'quave:migrations',
  git: 'https://github.com/quavedev/meteor-migrations.git',
});

Package.onUse(function(api) {
  api.versionsFrom('METEOR@3.0-alpha.17');

  api.use('ecmascript@0.16.7||0.16.8-alpha300.17');
  api.use(
      ["check@1.3.2||1.3.3-alpha300.17", "mongo@1.0.0||2.0.0||2.0.0-alpha300.17", "logging@1.3.2||1.3.3-alpha300.17"],
      "server",
  );

  api.mainModule('migrations_server.js', 'server');

  api.export('Migrations', 'server');
});

Package.onTest(function(api) {
  api.use('ecmascript');
  api.use(['percolate:migrations', 'tinytest']);

  api.addFiles('migrations_tests.js', ['server']);
});
