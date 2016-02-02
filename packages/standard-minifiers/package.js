Package.describe({
  name: 'standard-minifiers',
  version: '1.0.3-modules.6',
  summary: 'Standard minifiers used with Meteor apps by default.',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.imply(['standard-minifiers-css', 'standard-minifiers-js']);
});

Package.onTest(function(api) {});
