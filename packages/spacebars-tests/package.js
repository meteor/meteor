Package.describe({
  summary: "Additional tests for Spacebars"
});

// These tests are in a separate package to avoid a circular dependency
// between the `spacebars` and `templating` packages.
Package.on_test(function (api) {
  api.use('underscore');
  api.use('spacebars');
  api.use('tinytest');
  api.use('jquery');
  api.use('test-helpers');
  api.use('showdown');

  api.use('templating', 'client');
  api.add_files([
    'template_tests.html',
    'template_tests.js'
  ], 'client');
});
