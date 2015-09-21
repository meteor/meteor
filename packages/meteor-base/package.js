Package.describe({
  name: 'meteor-base',
  version: '1.0.1',
  // Brief, one-line summary of the package.
  summary: 'Packages that every Meteor app needs',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.imply([
    // Super basic stuff about where your code is running and async utilities
    'meteor',

    // This package enables making client-server connections; currently Meteor
    // only supports building client/server web applications so this is not
    // removable
    'webapp',

    // Most Meteor core packages depend on Underscore right now
    'underscore',

    // The protocol and client/server libraries that Meteor uses to send data
    'ddp',
    'livedata', // XXX COMPAT WITH PACKAGES BUILT FOR 0.9.0.

    // Push code changes to the client and automatically reload the page
    'hot-code-push'
  ]);
});
