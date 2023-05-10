Package.describe({
  name: 'standard-minifiers',
  version: '2.0.0-alpha300.5',
  summary: 'Standard minifiers used with Meteor apps by default.',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.imply([
    'standard-minifier-css',
    'standard-minifier-js'
  ]);
});
