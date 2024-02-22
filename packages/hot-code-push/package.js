Package.describe({
  name: 'hot-code-push',
  version: '1.0.5-beta300.2',
  // Brief, one-line summary of the package.
  summary: 'Update the client in place when new code is available.',
  // URL to the Git repository containing the source code for this package.
  git: 'https://github.com/meteor/meteor',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: 'README.md'
});

Package.onUse(function(api) {
  // Notifies the client when new versions of the app are available
  api.imply('autoupdate');

  // Reloads the page with an API to maintain data across the reload
  api.imply('reload');
});
