Package.describe({
  name: 'meteor-env-prod',
  version: '0.0.1-modules.6',
  summary: 'Package for setting up production-specific Meteor environment',
  prodOnly: true,
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.use('meteor', { unordered: true });
  api.export("process");
  api.addFiles('env.js');
});
