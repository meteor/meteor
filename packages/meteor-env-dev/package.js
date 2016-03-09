Package.describe({
  name: 'meteor-env-dev',
  version: '0.0.2-beta.15',
  summary: 'Package for setting up development-specific Meteor environment',
  debugOnly: true,
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.use('meteor', { unordered: true });

  api.addFiles('client.js', 'client');
  api.addFiles('server.js', 'server');

  api.export('meteorEnv');
});
