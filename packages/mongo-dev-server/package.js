Package.describe({
  debugOnly: true,
  documentation: 'README.md',
  name: 'mongo-dev-server',
  summary: 'Start MongoDB alongside Meteor, in development mode.',
  version: '1.1.1-rc300.4',
});

Package.onUse(function (api) {
  api.use('modules');
  api.mainModule('server.js', 'server');
});
