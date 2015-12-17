Package.describe({
  name: 'meteor-env-prod',
  version: '0.0.1',
  summary: 'Package for setting up production-specific Meteor environment',
  prodOnly: true,
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.use('meteor', { unordered: true });
  api.addFiles('env.js');
});
