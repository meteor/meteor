Package.describe({
  name: 'standard-minifiers',
  version: '1.2.0-rc340.2',
  summary: 'Standard minifiers used with Meteor apps by default.',
  documentation: 'README.md',
  devOnly: true,
});

Package.onUse(function(api) {
  api.imply([
    'standard-minifier-css',
    'standard-minifier-js'
  ]);
});
