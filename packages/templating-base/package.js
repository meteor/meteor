Package.describe({
  summary: "Base package for templating package",
  version: '1.1.5'
});

// This onUse describes the *runtime* implications of using this package.
Package.onUse(function (api) {
  // XXX would like to do the following only when the first html file
  // is encountered

  // The default is for the base package to provide Template both on the
  // client and server, but core templating package then use just the client
  // side. This allows 3rd party packages to reuse this package for server
  // side support.

  api.addFiles('templating.js');
  api.export('Template');

  api.use('underscore'); // only the subset in packages/blaze/microscore.js

  // html_scanner.js emits client code that calls Meteor.startup and
  // Blaze, so anybody using templating (eg apps) need to implicitly use
  // 'meteor' and 'blaze'.
  api.use(['blaze', 'spacebars']);
  api.imply(['meteor', 'blaze', 'spacebars']);
});
