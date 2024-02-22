Package.describe({
  name: 'allow-deny',
  version: '2.0.0-beta300.3',
  // Brief, one-line summary of the package.
  summary: 'Implements functionality for allow/deny and client-side db operations',
  // URL to the Git repository containing the source code for this package.
  git: 'https://github.com/meteor/meteor',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: null
});

Package.onUse(function(api) {
  api.use([
    'ecmascript',
    'minimongo', // Just for LocalCollection.wrapTransform :[
    'check',
    'ejson',
    'ddp',
  ]);

  api.addFiles('allow-deny.js');
  api.export('AllowDeny');
});

Package.onTest(function(api) {
  api.use('ecmascript');
  api.use('tinytest');
  api.use('allow-deny');
  api.addFiles('allow-deny-tests.js');
});
