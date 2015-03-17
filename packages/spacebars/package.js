Package.describe({
  summary: "Handlebars-like template language for Meteor",
  version: '1.0.6'
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
  api.use('templating');
  api.use('underscore');
  api.addFiles(['spacebars-runtime.js']);
  api.addFiles(['dynamic.html', 'dynamic.js'], 'client');
});

Package.onTest(function (api) {
  api.use(["spacebars", "tinytest", "test-helpers", "reactive-var"]);
  api.use("templating", "client");
  api.addFiles(["dynamic_tests.html", "dynamic_tests.js"], "client");
});
