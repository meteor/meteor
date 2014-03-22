Package.describe({
  summary: "Allows templates to be defined in .html files",
  internal: true
});

// Today, this package is closely intertwined with Handlebars, meaning
// that other templating systems will need to duplicate this logic. In
// the future, perhaps we should have the concept of a template system
// registry and a default templating system, ideally per-package.

Package._transitional_registerBuildPlugin({
  name: "compileTemplates",
  use: ['spacebars-compiler'],
  sources: [
    'plugin/html_scanner.js',
    'plugin/compile-templates.js'
  ]
});

// This on_use describes the *runtime* implications of using this package.
Package.on_use(function (api) {
  // XXX would like to do the following only when the first html file
  // is encountered

  api.add_files('global_template_object.js', 'client');
  api.export('Template', 'client');

  // html_scanner.js emits client code that calls Meteor.startup and
  // UI, so anybody using templating (eg apps) need to implicitly use
  // 'meteor' and 'ui'.
  api.use('ui');
  api.imply(['meteor', 'ui'], 'client');
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('htmljs');
  api.use('templating');
  api.use('underscore');
  api.use(['test-helpers', 'session', 'deps',
           'minimongo'], 'client');
  api.use('spacebars-compiler');

  api.add_files([
    'templating_tests.js',
    'templating_tests.html'
  ], 'client');
  api.add_files([
    'plugin/html_scanner.js',
    'scanner_tests.js'
  ], 'server');
});
