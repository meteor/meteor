Package.describe({
  summary: "Handlebars-like template language for Meteor"
});

// For more, see package `spacebars-compiler`, which is used by
// the build plugin and not shipped to the client unless you
// ask for it by name.
//
// The Spacebars build plugin is in package `templating`.
//
// Additional tests are in `spacebars-tests`.

Package.on_use(function (api) {
  api.export('Spacebars');

  api.use('htmljs');
  api.use('ui');
  api.add_files(['spacebars-runtime.js']);
});
