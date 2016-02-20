Package.describe({
  name: 'meteor-env-prod',
  version: '0.0.2-beta.11',
  summary: 'Package for setting up production-specific Meteor environment',
  prodOnly: true,
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.use('meteor', { unordered: true });
  api.addFiles('env.js');
  api.export("meteorEnv");
});
