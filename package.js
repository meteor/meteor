Package.describe({
  summary: "Handlebars-like template language for Meteor",
  version: '1.0.7'
});

// For more, see package `spacebars-compiler`, which is used by
// the build plugin and not shipped to the client unless you
// ask for it by name.
//
// The Spacebars build plugin is in package `templating`.
//
// Additional tests are in `spacebars-tests`.

Package.onUse(function (api) {
  api.export('Spacebars');

  api.use('htmljs');
  api.use('tracker');
  api.use('blaze');
  api.use('observe-sequence');
  api.use('underscore');
  api.addFiles(['spacebars-runtime.js']);
});
