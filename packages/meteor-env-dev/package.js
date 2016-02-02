Package.describe({
  name: 'meteor-env-dev',
  version: '0.0.1-modules.6',
  summary: 'Package for setting up development-specific Meteor environment',
  debugOnly: true,
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.use('meteor', { unordered: true });
  api.export("process");
  api.addFiles('env.js');
});
