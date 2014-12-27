Package.describe({
  name: '~name~',
  // Brief, one-line summary of the package.
  summary: '',
  version: '0.0.1',
  // By default, Meteor will default to using README.md for documentation. Use
  // this override to specify a different file, or 'null' to specify no
  // documentation at all.
  documentation: 'README.md',
  git: ''
});

Package.onUse(function(api) {
~cc~  api.versionsFrom('~release~');
  api.addFiles('~name~.js');
});

Package.onTest(function(api) {
  api.use('tinytest');
  api.use('~name~');
  api.addFiles('~name~-tests.js');
});
