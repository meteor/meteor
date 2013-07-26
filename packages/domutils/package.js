Package.describe({
  summary: "Utility functions for DOM manipulation",
  internal: true
});

Package.on_use(function (api) {
  // XXX
  // Doesn't actually require jQuery (but uses it if available).
  //
  // For now we are going to keep shipping jQuery with all apps
  // so as not to break existing apps, but any time now we will
  // cut this dependency.
  api.use('jquery', 'client');

  api.use('underscore', 'client');

  api.export('DomUtils', 'client');
  api.add_files('domutils.js', 'client');
});

Package.on_test(function (api) {
  api.use(['tinytest']);
  api.use(['domutils', 'test-helpers', 'underscore'], 'client');

  api.add_files([
    'domutils_tests.js'
  ], 'client');
});
