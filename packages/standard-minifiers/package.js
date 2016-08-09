Package.describe({
  name: 'standard-minifiers',
  version: '1.0.6',
  summary: 'Standard minifiers used with Meteor apps by default.',
  documentation: 'README.md',
  git: 'https://github.com/meteor/meteor/tree/master/packages/standard-minifiers'
});

Package.onUse(function(api) {
  api.imply(['standard-minifier-css','standard-minifier-js']);
});

Package.onTest(function(api) {});
