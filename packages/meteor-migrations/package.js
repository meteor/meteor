Package.describe({
  name: 'migrations',
  version: '2.0.2',
  summary: 'Define and run db migrations.',
});

Package.onUse(function(api) {
  api.use('ecmascript');
  api.use(['check', 'mongo', 'logging'], 'server');

  api.mainModule('migrations_server.js', 'server');

  api.export('Migrations', 'server');
});

Package.onTest(function(api) {
  api.use('ecmascript');
  api.use(['check', 'mongo', 'logging'], 'server');
  api.use(['tinytest']);

  api.addFiles('migrations_tests.js', ['server']);
});
