Package.describe({
  summary: "Handlebars-like template language for Meteor",
  internal: true
});

// For more, see package `spacebars-compiler`, which is used by
// the build plugin and not shipped to the client unless you
// ask for it by name.
//
// The Spacebars build plugin is in package `templating`.
//
// Additional tests are in `spacebars-tests`.

Package.on_use(function (api) {
  api.use('spacebars-common');
  api.imply('spacebars-common');

  api.use('htmljs');
  api.use('ui');
  api.use('templating');
  api.add_files(['spacebars-runtime.js']);
  api.add_files(['dynamic.html', 'dynamic.js'], 'client');
});

Package.on_test(function (api) {
  api.use(["spacebars", "tinytest", "test-helpers"]);
  api.use("templating", "client");
  api.add_files(["dynamic_tests.html", "dynamic_tests.js"], "client");
});
