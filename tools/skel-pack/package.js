Package.describe({
  name: '~name~',
  version: '0.0.1',
  // Brief, one-line summary of the package.
  summary: '',
  // URL to the Git repository containing the source code for this package.
  git: '',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: 'README.md'
});

Package.onUse(function(api) {
~cc~  api.versionsFrom('~release~');
  api.addFiles('~fs-name~.js');
});

Package.onTest(function(api) {
  api.use('tinytest');
  api.use('~name~');
  api.addFiles('~fs-name~-tests.js');
});
