Package.describe({
  debugOnly: true,
  name: 'postgres-dev-server',
  summary: 'Start PostgreSQL alongside Meteor, in development mode.',
  version: '1.0.0',
});

Package.onUse(function (api) {
  api.use('modules');
  api.mainModule('server.js', 'server');
});
