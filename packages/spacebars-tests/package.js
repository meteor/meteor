Package.describe({
  summary: "Additional tests for Spacebars",
  version: '1.0.1'
});

// These tests are in a separate package to avoid a circular dependency
// between the `spacebars` and `templating` packages.
Package.on_test(function (api) {
  api.use('underscore');
  api.use('spacebars');
  api.use('tinytest');
  api.use('jquery');
  api.use('test-helpers');
  api.use('reactive-var');
  api.use('showdown');
  api.use('minimongo');
  api.use('tracker');

  api.use('templating', 'client');
  api.add_files([
    'template_tests.html',
    'template_tests.js',
    'templating_tests.html',
    'templating_tests.js',

    'old_templates.js', // backcompat for packages built with old Blaze APIs.
    'old_templates_tests.js'
  ], 'client');

  api.add_files('template_tests_server.js', 'server');

  api.add_files([
    'assets/markdown_basic.html',
    'assets/markdown_if1.html',
    'assets/markdown_if2.html',
    'assets/markdown_each1.html',
    'assets/markdown_each2.html'
  ], 'server', { isAsset: true });
});
