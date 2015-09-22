Package.describe({
  summary: "Additional tests for Spacebars",
  version: '1.0.4'
});

// These tests are in a separate package to avoid a circular dependency
// between the `spacebars` and `templating` packages.
Package.onTest(function (api) {
  api.use([
    'es5-shim',
    'underscore',
    'spacebars',
    'tinytest',
    'jquery',
    'test-helpers',
    'reactive-var',
    'showdown',
    'minimongo',
    'tracker',
    'mongo',
    'random',
    'blaze',
    'session'
  ]);

  api.use('templating', 'client');
  api.addFiles([
    'template_tests.html',
    'template_tests.js',
    'templating_tests.html',
    'templating_tests.js',

    'old_templates.js', // backcompat for packages built with old Blaze APIs.
    'old_templates_tests.js'
  ], 'client');

  api.addFiles('template_tests_server.js', 'server');

  api.addAssets([
    'assets/markdown_basic.html',
    'assets/markdown_if1.html',
    'assets/markdown_if2.html',
    'assets/markdown_each1.html',
    'assets/markdown_each2.html'
  ], 'server');
});
