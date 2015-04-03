Package.describe({
  name: 'simple:comments',
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
  api.versionsFrom('1.1');

  api.addFiles('discuss.js');

  api.addFiles([
    'client/discuss.html',
    'client/discuss.js',
    'client/discuss.less'
  ], "client");

  api.use([
    "mongo",
    "templating",
    "jquery",
    "less"
  ]);
});
